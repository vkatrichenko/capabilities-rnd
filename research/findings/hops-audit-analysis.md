# HOPS AWOS audit analysis — Phase 1b

Analyzed 2026-08-14. Source: `hops/context/audits/`, primarily run `2026-08-03_19-15-15`
(newest), diffed against `2026-07-17_14-00-48`. All numbers recomputed from the per-dimension
JSON (`checks[]`), not taken from the narrative.

## Read the scores correctly

The `score` field in each dimension JSON is a **raw sum of awarded weights, not a percentage**.
The comparable health metric is `coverage` = awarded / applicable-max (excluding `applies: false`
checks), which is also what `report.md` headlines. Restated:

| Dimension | Raw `score` | Actual health (coverage) |
|---|---|---|
| ai-security | 45 | **100%** |
| supply-chain-security | 37.5 | **96.2%** |
| prevention-coverage | 32.6 | **81.5%** |
| application-security (ASVS 5.0) | 64.8 | **80.0%** |

An earlier note in this repo treated the raw scores as percentages ("prevention-coverage at 32.6
is the weakest area") — wrong; corrected 2026-08-14 (see `tasks/lessons.md`). HOPS's audited
security posture is strong, not weak. The research value is in the *remediation dynamics* and the
*audit blind spots*, not in a low baseline.

## What is actually open in the newest run (FAIL/WARN, applicable only)

| Check | Status | What | Assessment |
|---|---|---|---|
| PRV-05 | FAIL (w 0/3) | No mechanical module-boundary checking (ArchUnit / dependency-cruiser / eslint-boundaries) | Real gap; marginal to AI-SDLC security scope |
| PRV-08 | FAIL (w 0/3) | No mechanical docs checking (link checker / markdownlint) | Real gap; out of security scope |
| PRV-17 | WARN (w 1/2) | Agent instruction files don't declare the agent config surface (hooks, MCP, CLAUDE.md) security-sensitive | **Real, in-scope, cheap** — a paragraph in CLAUDE.md + review rule. Directly AI-SDLC. |
| SCS-08 | WARN (w 1.5/3) | 121 direct npm dependencies — large attack surface | Real; review-for-unused is the action |
| AS-01 | FAIL (w 0/8) | 13 plain-HTTP service URLs in config | **Accepted risk**, documented in `docs/processes/security-notes.md` (cluster-internal, TLS at ALB) — see "audit vs reality" below |
| AS-11 | WARN (w 3.5/5) | No threat model / security-requirements doc (design itself assessed as sound) | Real, in scope for the write-up |
| AS-13 | FAIL (w 0/5) | "No `.env.example` found" | **Audit false positive** — see below |

## The remediation loop, 2026-07-17 → 2026-08-03 (the article's before/after)

| Dimension | 07-17 | 08-03 | What changed |
|---|---|---|---|
| prevention-coverage | 66.0% (3F 3W) | 81.5% (2F 1W) | PRV-01 secret gate FAIL→PASS, PRV-12, PRV-06 fixed |
| supply-chain-security | 83.3% (1F 1W) | 96.2% (0F 1W) | SCS-03 exact pinning FAIL→PASS |
| application-security | 66.0% (4F 1W) | 80.0% (2F 1W) | AS-09 rate limiting, AS-10 authz FAIL→PASS |
| ai-security | 100% | 100% | — |

The causal chain is documented in the repo itself:
- 07-17 audit fails **PRV-01** (no secret-scanning gate) → `.gitleaks.toml` + CI job land
  **2026-07-30** (`git log --diff-filter=A -- .gitleaks.toml` → commit `835529c5a`); the config's
  own header cites "audit 2026-07-17, R7 / PRV-01".
- 07-17 fails **AS-09** (rate limiting) → `AuthRateLimitFilter` ships and its design rationale is
  recorded in `docs/processes/security-notes.md` under "AS-09".

This is the strongest evidence collected so far: an audit→fix→re-audit loop with dated commits,
16-point coverage gains in two dimensions in 17 days.

**Older runs** (2026-03-31 / 04-21 / 04-22): different schema (markdown, single `security.md`,
overall grades 79% / 77% / 79% "B") and a different check set — the security dimensions
(`ai-security`, `supply-chain-security`, `prevention-coverage`) don't exist there. Use them only
for the narrative "audits started in March", never for numeric comparison.

## Audit vs reality — three blind spots (verified by hand)

1. **AS-13 is a false positive.** The check says "no `.env.example` or `.env.template` found."
   Four exist, all pre-dating the run: `hop-backend/.env.example` + `hop-ui/.env.example` (added
   2026-05-15), `hop-agent/.env.example` (07-13), `e2e/.env.example` (07-30). The detector
   evidently only checks the repo root; in a monorepo, templates live per module. 5 weight points
   incorrectly lost — and it FAILed in 07-17 too, when two of the files already existed.
2. **AIS-03 skipped the check that matters most.** "Hook scripts contain no exfiltration /
   download-and-execute patterns" was skipped as not-applicable: "no `.claude/hooks/` directory
   found." But HOPS's hooks live in **`scripts/claude-hooks/`** (wired via
   `.claude/settings.json` → `block-secrets.sh`). The malicious-hook scan never read the actual
   hook scripts — a path-convention assumption, and precisely the AI-supply-chain surface the
   dimension exists to cover. `ai-security`'s 100% is therefore **overstated**.
3. **AS-01 keeps re-flagging an accepted risk.** The 13 plain-HTTP URLs are cluster-internal
   endpoints, formally accepted with reasoning in `docs/processes/security-notes.md` ("do not
   blind-flip these to https"). The audit has no accepted-risk / waiver mechanism, so every run
   re-raises it and permanently costs 8/8 weight — score noise that trains readers to ignore
   FAILs.

**Generalizable finding:** automated audit + human accepted-risk register don't reconcile; and
detectors carry path-layout assumptions (root-only `.env.example`, `.claude/hooks/`-only) that a
monorepo silently violates in both directions — phantom FAILs *and* phantom SKIPs.

## What Phase 2 should take from this

In-scope, actionable, not already shipped:
1. **PRV-17** — declare the agent-config surface (CLAUDE.md, `.claude/`, hooks, `.mcp.json`)
   security-sensitive in agent instruction files; require review for changes to it. Trivial cost.
2. **AIS-03 gap** — add a real check over the actual hook path (`scripts/claude-hooks/`), don't
   wait for the audit tool to fix its path assumption.
3. **SCS-08** — dependency-surface review (121 direct deps).
4. **AS-11** — a short threat-model document; doubles as article material.
5. Report AS-13 and AIS-03 detector bugs upstream to the AWOS audit owners.
