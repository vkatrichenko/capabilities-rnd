#!/usr/bin/env node
/**
 * Compare an OpenSSF Scorecard JSON result against a committed baseline and
 * fail when a gated check drops.
 *
 * Why a comparison instead of a threshold: Scorecard's aggregate is not a
 * usable gate for a private product repo. Four checks (License,
 * Security-Policy, CII-Best-Practices, Fuzzing) score against open-source
 * norms and are ~2.2 points that no in-scope change should move; SAST is a
 * known false negative wherever the SAST tool is self-hosted; Signed-Releases
 * reports -1 when no releases exist. A per-check ratchet says the only thing
 * worth saying: this repo did not get worse than the state we agreed to.
 *
 * Fails closed. A gated check that is missing from the results, has gone
 * inconclusive (-1), or is absent from the baseline is a failure, not a pass —
 * a control that reports clean when it did not run is the failure mode this
 * project has now found twice (gitleaks `regexTarget = "line"`; barley's
 * fail-open cassette scrubber).
 *
 * Zero dependencies, Node >= 20. Usage:
 *   node check-scorecard.mjs --results results.json --baseline baseline.json
 *   node check-scorecard.mjs --results results.json --write-baseline baseline.json
 *   node check-scorecard.mjs --results results.json --baseline baseline.json --summary $GITHUB_STEP_SUMMARY
 *
 * Exit 0 no regression, 1 a gated check regressed, 2 usage or unreadable input.
 */

import { readFileSync, writeFileSync } from 'node:fs'

// Gated: a drop fails the job. Each of these moves only when someone changes
// this repo — a workflow, a dependency pin, a review setting — so a drop is
// always actionable by whoever caused it.
export const GATED = [
  'Pinned-Dependencies',
  'Token-Permissions',
  'Dangerous-Workflow',
  'Binary-Artifacts',
  'Code-Review',
  'CI-Tests',
]

// Reported but never gated: these move with the outside world (a new advisory
// published against a dependency we already had) or with repository settings
// that no PR author can change. Gating them produces failures nobody can fix,
// which is how a gate gets deleted.
export const REPORTED = [
  'Vulnerabilities',
  'Branch-Protection',
  'Maintained',
  'Dependency-Update-Tool',
  'Contributors',
  'Packaging',
]

// Not tracked at all, with the reason recorded so nobody "fixes" them later.
export const IGNORED = {
  SAST: 'false negative — Scorecard detects CodeQL and SonarCloud; a self-hosted SonarQube instance is invisible to it',
  License: 'open-source norm, not applicable to a private product repo',
  'Security-Policy': 'open-source norm, not applicable to a private product repo',
  'CII-Best-Practices': 'open-source norm, not applicable to a private product repo',
  Fuzzing: 'open-source norm, not applicable to a private product repo',
  'Signed-Releases': 'inconclusive (-1) while no releases exist',
}

export const TRACKED = [...GATED, ...REPORTED]

export class InputError extends Error {}

export function readJson(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    throw new InputError(`cannot read ${path}: ${err.message}`)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new InputError(`cannot parse ${path}: ${err.message}`)
  }
}

/** Scores by check name, from a Scorecard JSON result. */
export function scoresOf(results) {
  if (!results || !Array.isArray(results.checks)) {
    throw new InputError('not a Scorecard JSON result: no `checks` array')
  }
  return new Map(results.checks.map((c) => [c.name, c]))
}

/** The trimmed baseline we commit: tracked scores plus what produced them. */
export function baselineFrom(results) {
  const checks = scoresOf(results)
  const tracked = {}
  for (const name of TRACKED) {
    const check = checks.get(name)
    if (check) tracked[name] = check.score
  }
  return {
    _comment: 'Ratchet for check-scorecard.mjs. Raising a score here is a reviewed commit, never automatic.',
    scorecard_version: results.scorecard?.version ?? 'unknown',
    measured: {
      date: results.date ?? 'unknown',
      repo: results.repo?.name ?? 'unknown',
      commit: results.repo?.commit ?? 'unknown',
      aggregate: results.score,
    },
    checks: tracked,
  }
}

/**
 * Compare results against a baseline.
 * Returns { rows, regressions, notes } — `regressions` non-empty means exit 1.
 */
export function compare(results, baseline) {
  const checks = scoresOf(results)
  const base = baseline?.checks
  if (!base || typeof base !== 'object') {
    throw new InputError('not a baseline file: no `checks` object')
  }

  const rows = []
  const regressions = []
  const notes = []

  const baseVersion = baseline.scorecard_version ?? 'unknown'
  const nowVersion = results.scorecard?.version ?? 'unknown'
  if (baseVersion !== nowVersion) {
    // Not a failure, but it must be said out loud: check definitions change
    // between Scorecard versions, so a delta across versions is not evidence
    // that the repository moved.
    notes.push(
      `Scorecard version changed since the baseline (${baseVersion} -> ${nowVersion}). ` +
        'A score difference across versions may be tool drift, not a repository change. ' +
        'Re-baseline deliberately rather than reading it as a win or a regression.',
    )
  }

  for (const name of TRACKED) {
    const gated = GATED.includes(name)
    const check = checks.get(name)
    const before = Object.prototype.hasOwnProperty.call(base, name) ? base[name] : null
    const after = check ? check.score : null
    const row = { name, gated, before, after, reason: check?.reason ?? '', status: 'ok' }

    if (after === null) {
      row.status = 'missing from results'
      if (gated) regressions.push(row)
    } else if (before === null) {
      row.status = 'missing from baseline'
      if (gated) regressions.push(row)
    } else if (after === -1 && before !== -1) {
      row.status = 'inconclusive (-1)'
      if (gated) regressions.push(row)
    } else if (after < before) {
      row.status = 'REGRESSED'
      if (gated) regressions.push(row)
    } else if (after > before) {
      row.status = 'improved'
    }
    rows.push(row)
  }

  for (const name of Object.keys(IGNORED)) {
    if (!checks.has(name)) continue
    rows.push({
      name,
      gated: false,
      ignored: true,
      before: null,
      after: checks.get(name).score,
      reason: IGNORED[name],
      status: 'not tracked',
    })
  }

  return { rows, regressions, notes }
}

export function toMarkdown(results, baseline, { rows, regressions, notes }) {
  const num = (v) => (v === null ? '—' : String(v))
  const out = []
  out.push('## OpenSSF Scorecard')
  out.push('')
  out.push(
    `\`${results.repo?.name ?? '?'}\` @ \`${(results.repo?.commit ?? '').slice(0, 9)}\` · ` +
      `Scorecard ${results.scorecard?.version ?? '?'} · ` +
      `baseline \`${(baseline.measured?.commit ?? '').slice(0, 9)}\` (${baseline.measured?.date ?? '?'})`,
  )
  out.push('')
  out.push(
    `Aggregate **${results.score}** — reported only. It is not a gate: ` +
      'four checks score a private repo against open-source norms, and SAST is a known false negative here.',
  )
  out.push('')
  out.push('| Check | Policy | Baseline | Now | Status |')
  out.push('|---|---|---:|---:|---|')
  for (const r of rows) {
    const policy = r.ignored ? 'ignored' : r.gated ? '**gated**' : 'reported'
    const status = r.status === 'REGRESSED' ? '**REGRESSED**' : r.status
    out.push(`| ${r.name} | ${policy} | ${num(r.before)} | ${num(r.after)} | ${status} |`)
  }
  out.push('')
  for (const n of notes) out.push(`> ${n}`)
  if (notes.length) out.push('')
  if (regressions.length) {
    out.push('### Gated regressions')
    out.push('')
    for (const r of regressions) {
      out.push(`- **${r.name}**: ${num(r.before)} -> ${num(r.after)} (${r.status})`)
      if (r.reason) out.push(`  - ${r.reason}`)
    }
  } else {
    out.push('No gated check regressed.')
  }
  out.push('')
  return out.join('\n')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    if (name === 'advisory') { args.advisory = true; continue }
    args[name] = argv[++i]
  }
  return args
}

export function main(argv, deps = {}) {
  const log = deps.log ?? console.log
  const err = deps.err ?? console.error
  const args = parseArgs(argv)

  if (!args.results) {
    err('usage: --results <scorecard.json> (--baseline <baseline.json> | --write-baseline <path>) [--summary <path>] [--advisory]')
    return 2
  }

  let results
  try {
    results = readJson(args.results)
    if (args['write-baseline']) {
      const baseline = baselineFrom(results)
      writeFileSync(args['write-baseline'], `${JSON.stringify(baseline, null, 2)}\n`)
      log(`wrote baseline: ${args['write-baseline']}`)
      return 0
    }
    if (!args.baseline) {
      err('usage: --results <scorecard.json> (--baseline <baseline.json> | --write-baseline <path>)')
      return 2
    }
    const baseline = readJson(args.baseline)
    const verdict = compare(results, baseline)
    const md = toMarkdown(results, baseline, verdict)
    log(md)
    if (args.summary) writeFileSync(args.summary, md)
    if (!verdict.regressions.length) return 0
    return args.advisory ? 0 : 1
  } catch (e) {
    if (!(e instanceof InputError)) throw e
    err(`check-scorecard: ${e.message}`)
    return 2
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)))
}
