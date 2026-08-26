# The agent-config surface across four repos — read-only sweep

Produced 2026-08-25 with `tooling/ci/agent-config-scan/check-agent-config.mjs`, read-only, against
each repo's working tree. `hops` at `origin/main` `dca2ed7b0`, `hops-mcp` at `7ef818d`, `barley` and
`sowinsights` at their checked-out `main`. No values are reproduced: a credential finding reports
rule, file, line and a `sha256` fingerprint, never the match.

Command, per repo:

```sh
node tooling/ci/agent-config-scan/check-agent-config.mjs --repo <repo> --json
```

## What is there

| | `.claude/settings*.json` | Registered hooks | of which inline-only | Hook script files scanned | Enabled plugins | Marketplace pinned |
|---|---|---|---|---|---|---|
| `hops` | 2 | 4 | **2** | 2 | 17 | ❌ `github: provectus/awos`, no ref |
| `barley` | 1 | 0 | — | 0 | 3 | ❌ same source, no ref |
| `hops-mcp` | 1 | 2 | **2** | 0 | 0 | ❌ registered, unused |
| `sowinsights` | 0 | — | — | — | — | no `.claude/` at all |

Blocking findings: **0 in all four.** One advisory in each of the three repos that have a `.claude/`
— the unpinned plugin marketplace.

## The three numbers that matter

**1. Four of the six registered hooks in this org exist only as inline `command` strings.** Both of
`hops-mcp`'s, and two of `hops`' four. Inline hook shell is code that no linter parses, no reviewer
sees as code in a diff, and no directory-based scanner can find. That is the reason this scanner
resolves the surface from settings rather than from a path.

**2. `hops`' hooks are not in `.claude/hooks/`.** They are in `scripts/claude-hooks/`, wired from
`.claude/settings.json`. The AWOS `ai-security` audit's hook-content check (AIS-03) skips on "no
`.claude/hooks/` directory found", so on the most-hardened repo of the four it has never read a hook.
`ai-security`'s reported 100% is overstated by exactly that check. `hops-mcp` and `barley` would skip
for the same reason if they were ever audited; neither has been.

**3. Three of four repos execute third-party agent code from an unpinned source.** All three declare
the `awos-marketplace` as `{"source": "github", "repo": "provectus/awos"}` with no `ref`, `commit` or
`tag`. `hops` has 17 enabled plugins, `barley` 3, `hops-mcp` 0 (declared but unused). Plugins ship
hooks, agents and skills, so an enabled plugin from a mutable source is arbitrary local code
re-resolved at session start — the same class as `.mcp.json` `:latest` (W1.4) and unpinned GitHub
Actions, on a third surface nobody was counting.

This corrects an earlier framing in this project's notes. `barley` having **zero** agent hooks — its
own 2026-06-03 audit's SEC-02 critical FAIL — was read as "no agent-config surface to protect". It
has the largest one of the four by agent and skill count, and it is the only kind that is *indirect*:
nothing local to review, three plugins resolved from someone else's default branch.

## What the tripwires found

Two rules exist against `barley`'s documented incident (a production database password, a LangSmith
key and an OAuth client secret in `psql` permission allow-patterns in `.claude/settings.local.json`,
per its own audit):

- **Credentials in `permissions.allow` / `deny` / `ask`** — `hops` is the only repo of the four with a
  `settings.local.json` present on this machine. It carries `enabledMcpjsonServers` and no
  `permissions` block at all. Zero findings. The tripwire ran against a real local settings file and
  came back empty, which is a measurement, not an assumption.
- **Guard tampering** — zero findings; only `hops` has a guard to tamper with.

## False-positive rate, measured

The negative control is the six real hooks plus the two scripts they reference: `hops`'
`block-secrets.sh` (123 lines) and `pre-commit` (168 lines), and `hops-mcp`'s two inline commands.

Two of the narrowings were made at design time, from reading the two scripts before running
anything, so they never appear as a measured regression. To make them evidence rather than an
assertion, each naive form was run afterwards against the same two files and counted:

| Rule, in its naive form | Matches on the real scripts |
|---|---|
| `credential-read`, sensitive path anywhere on the line | **18** (`block-secrets.sh` 18, `pre-commit` 0) |
| `hardcoded-credential`, unanchored prefixes (`AKIA`, `ghp_`, `xox…`, `sk-`) | **7** (all in `pre-commit`) |
| `guard-tamper`, bare `SKIP_SECRETS=1` | **4** (all in `pre-commit`) |
| `guard-tamper`, any mention of `.git/hooks` | **1** (`pre-commit`) |
| `credential-read`, verb-adjacent but comments not skipped | **1** (`block-secrets.sh:104`) |
| **The shipped rules** | **0** |

The last row is the only one that was a live failure: the scanner's first real run against `hops`
returned exactly one finding, a whole-line comment in `block-secrets.sh` documenting the attack it
blocks (`# ... so \`cat *.env\` ... match`).

Every one of these came from *security* code: a guard naming the 18 paths it blocks, a scanner
carrying the 7 patterns it matches, help text printing the escape hatch 4 times, a hook that
reinstalls the guard, a comment describing the attack. The rules and the reason each was narrowed are
recorded inline in the scanner and in `research/findings/agent-config-scan-design.md`.

## Positive control on the real configuration

`hops`' actual `.claude/settings.json` and `block-secrets.sh`, copied to a temp directory with two
plants: an exfil command appended to a real registered hook, and one line appended to the real guard
script.

```
x exfil-http        .claude/settings.json:hooks.PostToolUse[0].hooks[0].command:1
x exfil-http        scripts/claude-hooks/block-secrets.sh:125
x credential-read   scripts/claude-hooks/block-secrets.sh:125
3 blocking finding(s)   EXIT=1
```

Both plants caught; the other 124 lines of the real guard stayed silent. Exit 0 before the plants,
exit 1 after.

## Confirmed in CI (hops PR #556, 2026-08-25)

The gate ran on its own pull request with **zero labels applied** — which is the point of not
label-gating it — and produced output identical to the local run:

```
  4 registered hook(s): 2 referencing a script, 2 inline-only
  2 file(s) scanned: scripts/claude-hooks/block-secrets.sh, scripts/pre-commit
  17 enabled plugin(s)
  - unpinned-plugin-marketplace  .claude/settings.json:extraKnownMarketplaces.awos-marketplace
  advisory findings only.
```

Self-test in CI: 22 tests, 20 pass, 2 skipped (the two needing this repo's `fixtures/real-hooks`),
0 fail. Every other check on the PR passed too, including `Secret scan – gitleaks` — which settles
the open question of whether the scanner's own pattern list would trip the repo's secret gate. It
does not: the value patterns it carries are regex definitions, and the test file's synthetic
credentials are assembled from fragments precisely so a literal never appears.

One check did fail first: `Spec link – PR template`, on both PRs, because the bodies were the commit
messages and carried no filled `Spec:` field. Nothing to do with the diff; fixed by writing proper
PR bodies. Recorded in `tasks/lessons.md`.

### hops-mcp PR #56, 2026-08-26

Same scanner, second repo, all five checks green. The gate output is the other half of the finding:

```
  2 registered hook(s): 0 referencing a script, 2 inline-only
  0 file(s) scanned: none
  0 enabled plugin(s)
  - unpinned-plugin-marketplace  .claude/settings.json:extraKnownMarketplaces.awos-marketplace
  advisory findings only.
```

`0 file(s) scanned` with `2 registered hook(s)` is exactly the repo shape a directory-based check
reads as "nothing to audit". Both hooks are inline `command` strings; there is no hooks directory to
find. Self-test 22 tests / 20 pass / 2 skipped, as in hops.

## Review routing, as it stands today

Checked 2026-08-26. Only `hops` (this work) and `barley` have a `CODEOWNERS` at all.

| Repo | CODEOWNERS | Covers the agent-config surface |
|---|---|---|
| `hops` | ✅ added by PR #557 | ✅ `CLAUDE.md`, `.claude/`, `.mcp.json`, `scripts/claude-hooks/`, `scripts/pre-commit` |
| `barley` | ✅ pre-existing (Feb 2026) | ❌ `/terraform/` and `/.github/workflows/` only |
| `hops-mcp` | ❌ | ❌ |
| `sowinsights` | ❌ | ❌ |

`barley`'s is the more useful data point than an absence would have been: the repo already accepted
that infrastructure and CI config deserve routed review, and named three owners for it. The surface
that executes with a developer's full local privileges was simply never on the list — which is the
argument the recommendation should lead with, rather than "you have no CODEOWNERS".

## Coverage this does not have

- **`sowinsights` is a genuine blank.** No `.claude/`, so a gate there would be a tripwire on nothing
  until the repo acquires an agent surface. Not proposed.
- **`barley` gets no gate.** Its surface is real but indirect, and the only finding a scanner would
  report there today is the advisory one already in this table — which is a recommendation to its
  owners, not a job. Landing our own code in a repo we do not maintain has a cost the finding does not
  justify yet.
- **Skills, agents and command definitions are not scanned.** They legitimately document shell in
  prose; the same rules there produce noise. The hook surface is what executes unattended.
- **`.mcp.json` is not scanned here.** W2.1 owns it.
- **The unpinned-marketplace rule is advisory, not blocking.** Claude Code has no documented `ref`
  field for a marketplace source, so the finding may have no remedy. A gate whose finding cannot be
  fixed is a gate that gets disabled. It is reported and counted; it does not fail a build.
