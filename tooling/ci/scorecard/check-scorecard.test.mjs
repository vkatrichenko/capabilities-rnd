/**
 * Self-tests for check-scorecard. Fully offline — no Scorecard run, no network.
 *
 * Run: node --test check-scorecard.test.mjs
 *
 * The fail-closed cases (missing check, missing baseline entry, -1
 * inconclusive) are the point of this file. A comparison tool that treats
 * "absent" as "fine" reports clean exactly when the measurement broke.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  compare,
  toMarkdown,
  baselineFrom,
  main,
  GATED,
  REPORTED,
  IGNORED,
  TRACKED,
  API_ONLY,
} from './check-scorecard.mjs'

const ALL = [...TRACKED, ...Object.keys(IGNORED)]

/** A full Scorecard result with every check at 10, overridden by `scores`. */
function results(scores = {}, { version = 'v5.5.0', commit = 'abc123def456' } = {}) {
  return {
    date: '2026-08-23',
    repo: { name: 'github.com/x/y', commit },
    scorecard: { version },
    score: 5.4,
    checks: ALL.filter((n) => scores[n] !== undefined || !(n in scores))
      .map((n) => ({ name: n, score: scores[n] ?? 10, reason: `reason for ${n}` })),
  }
}

function baseline(scores = {}, { version = 'v5.5.0' } = {}) {
  return {
    scorecard_version: version,
    measured: { date: '2026-08-18', repo: 'github.com/x/y', commit: 'f640dee9f', aggregate: 5.4 },
    checks: Object.fromEntries(TRACKED.map((n) => [n, scores[n] ?? 10])),
  }
}

function tmpFile(name, obj) {
  const path = join(mkdtempSync(join(tmpdir(), 'sc-')), name)
  writeFileSync(path, typeof obj === 'string' ? obj : JSON.stringify(obj))
  return path
}

/** main() with output captured, so a failing assert prints something readable. */
function run(argv) {
  const out = []
  const code = main(argv, { log: (m) => out.push(m), err: (m) => out.push(m) })
  return { code, out: out.join('\n') }
}

describe('policy', () => {
  test('every check is classified exactly once', () => {
    const seen = [...GATED, ...REPORTED, ...Object.keys(IGNORED)]
    assert.equal(new Set(seen).size, seen.length, 'a check appears in two policy lists')
    // 18 checks is Scorecard v5's full set. If upstream adds one, this fails and
    // someone has to decide gated/reported/ignored rather than silently drop it.
    assert.equal(seen.length, 18)
  })

  test('rolling-window checks are reported, not gated', () => {
    // Code-Review and CI-Tests score recent changesets, not this commit.
    // Gating them fails one pull request because other people merged
    // unreviewed that week — the reason this job is safe to run on a PR is
    // that every gated check is fixable by the author of the change.
    for (const name of ['Code-Review', 'CI-Tests']) {
      assert.ok(REPORTED.includes(name))
      assert.ok(!GATED.includes(name))
    }
    const v = compare(
      results({ 'Code-Review': 0, 'CI-Tests': 0 }),
      baseline({ 'Code-Review': 10, 'CI-Tests': 10 })
    )
    assert.deepEqual(v.regressions, [])
  })
})

describe('compare', () => {
  test('no movement is not a regression', () => {
    const v = compare(results(), baseline())
    assert.deepEqual(v.regressions, [])
    assert.deepEqual(v.notes, [])
  })

  test('a gated check dropping is a regression, and is named', () => {
    const v = compare(results({ 'Pinned-Dependencies': 3 }), baseline({ 'Pinned-Dependencies': 5 }))
    assert.equal(v.regressions.length, 1)
    assert.equal(v.regressions[0].name, 'Pinned-Dependencies')
    assert.equal(v.regressions[0].status, 'REGRESSED')
  })

  test('a reported check dropping is shown but does not fail', () => {
    const v = compare(results({ Vulnerabilities: 0 }), baseline({ Vulnerabilities: 8 }))
    assert.deepEqual(v.regressions, [])
    assert.equal(v.rows.find((r) => r.name === 'Vulnerabilities').status, 'REGRESSED')
  })

  test('a rise is reported as improved and never auto-ratchets', () => {
    const v = compare(results({ 'Token-Permissions': 9 }), baseline({ 'Token-Permissions': 0 }))
    assert.deepEqual(v.regressions, [])
    const row = v.rows.find((r) => r.name === 'Token-Permissions')
    assert.equal(row.status, 'improved')
    assert.equal(row.before, 0, 'baseline must be left alone — raising it is a reviewed commit')
  })

  test('an ignored check dropping to 0 is silent', () => {
    const v = compare(results({ SAST: 0, License: 0 }), baseline())
    assert.deepEqual(v.regressions, [])
    assert.equal(v.rows.find((r) => r.name === 'SAST').status, 'not tracked')
  })
})

describe('fails closed', () => {
  test('a gated check missing from the results fails', () => {
    const r = results()
    r.checks = r.checks.filter((c) => c.name !== 'Dangerous-Workflow')
    const v = compare(r, baseline())
    assert.equal(v.regressions.length, 1)
    assert.equal(v.regressions[0].status, 'missing from results')
  })

  test('a reported check missing from the results does not fail', () => {
    const r = results()
    r.checks = r.checks.filter((c) => c.name !== 'Branch-Protection')
    const v = compare(r, baseline())
    assert.deepEqual(v.regressions, [])
  })

  test('a gated check missing from the baseline fails — a stale baseline is not a pass', () => {
    const b = baseline()
    delete b.checks['Dangerous-Workflow']
    const v = compare(results(), b)
    assert.equal(v.regressions.length, 1)
    assert.equal(v.regressions[0].status, 'missing from baseline')
  })

  test('a gated check going inconclusive (-1) fails', () => {
    const v = compare(results({ 'Binary-Artifacts': -1 }), baseline({ 'Binary-Artifacts': 9 }))
    assert.equal(v.regressions.length, 1)
    assert.equal(v.regressions[0].status, 'inconclusive (-1)')
  })

  test('a check that was already -1 in the baseline stays quiet', () => {
    const v = compare(results({ 'Token-Permissions': -1 }), baseline({ 'Token-Permissions': -1 }))
    assert.deepEqual(v.regressions, [])
  })
})

describe('local mode', () => {
  // scorecard-action runs `--local .` on a pull_request event. Seven API-backed
  // checks simply do not run there. Calling that 'missing from results' reports
  // a broken measurement when nothing broke — but the reverse error is worse,
  // so a gated check absent from a local run still fails.
  const measurable = ALL.filter((n) => !API_ONLY.includes(n))
  const localResults = (names) => {
    const r = results()
    r.repo = { name: 'file://.', commit: 'unknown' }
    r.checks = r.checks.filter((c) => names.includes(c.name))
    return r
  }

  test('API checks are marked, not treated as regressions', () => {
    const v = compare(localResults(measurable), baseline())
    assert.deepEqual(v.regressions, [])
    for (const name of API_ONLY) {
      const row = v.rows.find((r) => r.name === name)
      if (row) assert.equal(row.status, 'not measurable in local mode')
    }
    assert.equal(v.notes.length, 1)
    assert.match(v.notes[0], /Local directory mode/)
  })

  test('a gated check absent from a local run still fails', () => {
    const names = measurable.filter((n) => n !== 'Binary-Artifacts')
    const v = compare(localResults(names), baseline())
    assert.deepEqual(
      v.regressions.map((r) => r.name),
      ['Binary-Artifacts'],
    )
    assert.equal(v.regressions[0].status, 'missing from results')
  })

  test('a remote run still calls an absent API check missing', () => {
    const r = results()
    r.checks = r.checks.filter((c) => c.name !== 'Branch-Protection')
    const v = compare(r, baseline())
    assert.equal(v.rows.find((x) => x.name === 'Branch-Protection').status, 'missing from results')
    assert.deepEqual(v.notes, [])
  })

  test('markdown says the aggregate is not comparable', () => {
    const r = localResults(measurable)
    const out = toMarkdown(r, baseline(), compare(r, baseline()))
    assert.match(out, /local working tree ·/)
    assert.match(out, /\*\*not comparable\*\*/)
  })
})

describe('version drift', () => {
  test('a Scorecard version change is flagged as a note, not a failure', () => {
    const v = compare(results({}, { version: 'v5.6.0' }), baseline({}, { version: 'v5.5.0' }))
    assert.deepEqual(v.regressions, [])
    assert.equal(v.notes.length, 1)
    assert.match(v.notes[0], /v5\.5\.0 -> v5\.6\.0/)
  })
})

describe('main', () => {
  test('exit 1 on a gated regression, and the check is named in the output', () => {
    const { code, out } = run([
      '--results', tmpFile('r.json', results({ 'Binary-Artifacts': 4 })),
      '--baseline', tmpFile('b.json', baseline({ 'Binary-Artifacts': 10 })),
    ])
    assert.equal(code, 1)
    assert.match(out, /Gated regressions/)
    assert.match(out, /Binary-Artifacts\*\*: 10 -> 4/)
  })

  test('exit 0 when nothing regressed', () => {
    const { code, out } = run([
      '--results', tmpFile('r.json', results()),
      '--baseline', tmpFile('b.json', baseline()),
    ])
    assert.equal(code, 0)
    assert.match(out, /No gated check regressed/)
  })

  test('--advisory downgrades a regression to exit 0 but still prints it', () => {
    const { code, out } = run([
      '--results', tmpFile('r.json', results({ 'Dangerous-Workflow': 1 })),
      '--baseline', tmpFile('b.json', baseline({ 'Dangerous-Workflow': 10 })),
      '--advisory',
    ])
    assert.equal(code, 0)
    assert.match(out, /Gated regressions/)
  })

  test('exit 2 on malformed JSON', () => {
    const { code, out } = run([
      '--results', tmpFile('r.json', '{not json'),
      '--baseline', tmpFile('b.json', baseline()),
    ])
    assert.equal(code, 2)
    assert.match(out, /cannot parse/)
  })

  test('exit 2 when the results file is not a Scorecard result', () => {
    const { code, out } = run([
      '--results', tmpFile('r.json', { hello: 'world' }),
      '--baseline', tmpFile('b.json', baseline()),
    ])
    assert.equal(code, 2)
    assert.match(out, /no `checks` array/)
  })

  test('exit 2 on a missing file', () => {
    const { code, out } = run(['--results', '/nope/missing.json', '--baseline', '/nope/b.json'])
    assert.equal(code, 2)
    assert.match(out, /cannot read/)
  })

  test('exit 2 with no arguments', () => {
    assert.equal(run([]).code, 2)
  })

  test('--summary writes the same markdown it printed', () => {
    const summary = join(mkdtempSync(join(tmpdir(), 'sc-')), 'summary.md')
    const { code, out } = run([
      '--results', tmpFile('r.json', results()),
      '--baseline', tmpFile('b.json', baseline()),
      '--summary', summary,
    ])
    assert.equal(code, 0)
    assert.equal(readFileSync(summary, 'utf8'), out)
  })

  test('--write-baseline round-trips into a baseline the comparison accepts', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sc-')), 'baseline.json')
    const r = results({ 'Pinned-Dependencies': 0, Vulnerabilities: 0 })
    assert.equal(run(['--results', tmpFile('r.json', r), '--write-baseline', path]).code, 0)

    const written = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(written.scorecard_version, 'v5.5.0')
    assert.equal(written.measured.commit, 'abc123def456')
    assert.deepEqual(Object.keys(written.checks).sort(), [...TRACKED].sort())
    assert.equal(written.checks['Pinned-Dependencies'], 0)
    assert.ok(!('SAST' in written.checks), 'ignored checks must not enter the baseline')

    assert.deepEqual(compare(r, written).regressions, [])
  })
})

describe('baselineFrom', () => {
  test('omits tracked checks the run did not produce, rather than inventing a 0', () => {
    const r = results()
    r.checks = r.checks.filter((c) => c.name !== 'Packaging')
    const b = baselineFrom(r)
    assert.ok(!('Packaging' in b.checks))
  })
})
