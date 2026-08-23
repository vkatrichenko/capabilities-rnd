# Phase 2 — before-state reference

Captured **2026-08-18**, at Gate 0, before any change lands in `hops`. Every Wave-1/2/3 "after"
measurement points back here. No new measurement was run for this note except the audit-JSON
re-reads recorded in "corrections" below — it links the Phase 1 evidence that already exists.

**Pinned commit:** `hops` @ `f640dee9f99c35997d11fb16ba2170b48e14df13` — `origin/main` at
2026-08-18T14:42:52Z, confirmed via the GitHub API and the commit Scorecard scanned. The local
clone was at `0a5303371` (2026-08-13) and is **behind origin**; the Phase 1 evidence was gathered
against that older tree, so any per-file claim below is as-of the local clone, while the Scorecard
row is as-of origin. Re-fetch before branching the first PR.

## The linked evidence

| Reference | Source of record |
|---|---|
| AWOS audit, 2026-08-03 run | `research/findings/hops-audit-analysis.md`; raw JSON in `hops/context/audits/2026-08-03_19-15-15/` |
| Secret-scan state, all four repos | `research/findings/secret-scan-2026-08-14.md`; raw JSON in `scratch/` (gitignored) |
| Cross-repo control matrix | `research/baseline/cross-repo-matrix.md` |
| `hops` control inventory, 5 layers | `research/baseline/hops-security-baseline.md` |
| Satellite-repo findings | `research/findings/satellite-repos-1c.md` |
| OpenSSF Scorecard baseline | `artifacts/scorecard-baseline-hops.md` (2026-08-18, aggregate 5.4/10) |

## Audit coverage — the numbers the checkpoint compares against

Coverage = awarded / applicable-max. `score` is a raw weight sum, not a percent.

| Dimension | Coverage | Applicable weight | Open (non-PASS, applicable) |
|---|---|---|---|
| `ai-security` | 100% | 45 / 45 | none — but see AIS-03 below, the 100% is overstated |
| `supply-chain-security` | 96.2% | 25 / 26 | SCS-08 WARN (1.5/3) — 121 direct npm deps |
| `prevention-coverage` | 81.5% | 32.6 / 40 | PRV-05 FAIL (0/3), PRV-08 FAIL (0/3), PRV-17 WARN (1/2) |
| `application-security` | 80.0% | 64.8 / 81 | AS-01 FAIL (0/8, accepted risk), AS-11 WARN (3.5/5), AS-13 FAIL (0/5, audit FP) |
| `ai-sdlc-adoption` | 86.6% | 50.2 / 58 | ADP-04 FAIL (0/5), ADP-07/13/15 PARTIAL |

Secret scan, `hops`: history clean post-gate (2 high-confidence findings, both pre-gate history);
tuned-config worktree scan `scratch/gitleaks-worktree-tuned-hops.json` → **0 findings**.

## Corrections to the Phase 2 plan, found while capturing this

Three things the approved checklist assumed that the audit JSON does not support. Recorded here
because they change what Wave 1 can claim, not just how it is written.

### 1. W1.1 cannot "close SCS-04" — SCS-04 is unmeasurable by the detector

`SCS-04` is `SKIP` / `applies: false`, weight 0/8, with this evidence verbatim:

> "SCS-04 (quarantine-age) requires live registry API calls to resolve per-version publish
> timestamps · This check is non-deterministic offline — it is intentionally skipped by the
> static detector"

So adding `minimumReleaseAge` **will not flip SCS-04 to PASS in a re-run** — the detector will
skip it again. The cooldown remains worth doing on its merits (it is a real control against the
npm-compromise class), but its evidence has to be a **local reproduction** — a demonstrated
install failure against a <cooldown-age package — not an audit-score delta.

Because SCS-04 is excluded from applicable-max, it costs nothing today: 25/26 = 96.2%. If it ever
became measurable and passed, coverage would read 33/34 = 97.1%.

### 2. The cooldown window in the plan is below AWOS's own bar

AWOS calibrates SCS-04 at **7 days (10080 minutes)**, explicitly stricter than pnpm's 1-day
default:

> "The 7-day window matches pnpm's documented one-week `minimumReleaseAge` option; pnpm's default
> is 1 day — the stricter choice is AWOS calibration."

The plan's `minimumReleaseAge: 1440` is 24 hours. Decide deliberately: 1440 (pnpm default, low
friction) or 10080 (AWOS calibration, and the number the article would have to defend).

### 3. The `.claude/hooks/` path assumption costs `hops` twice, not once

Phase 1 recorded the AIS-03 phantom skip. The same root cause hits a second check:

| Check | Status | Evidence verbatim | Effect |
|---|---|---|---|
| `AIS-03` | SKIP, 0/8, `applies: false` | "no `.claude/hooks/` directory found — AIS-03 not applicable" | Malicious-hook-content check never runs; `ai-security` 100% is overstated |
| `ADP-04` | **FAIL, 0/5, applies: true** | "layer absent: hook directory (`.claude/hooks` or equivalent)" | Real **−5 weight** against `ai-sdlc-adoption` for hooks that exist |

`hops` registers four hook commands in `.claude/settings.json` — one `PreToolUse`
(`scripts/claude-hooks/block-secrets.sh`, the secret guard) and three inline `PostToolUse`
commands. The detector looks only for a `.claude/hooks/` **directory** and never reads
`settings.json`, so it sees none of them.

Two consequences for Phase 2:

- **A measurable quick win exists that the plan does not list.** Relocating the hook to
  `.claude/hooks/` (or symlinking) would flip ADP-04 FAIL→PASS (+5 → `ai-sdlc-adoption` 55.2/58 =
  95.2%) *and* make AIS-03 actually execute — turning an overstated 100% into a real one. It is a
  one-file change with a genuine before/after number, unlike W1.1. Sequence it against W3.4:
  moving the file works around the bug, filing it upstream fixes it for every repo. Doing both,
  in that order, is the honest option — and the workaround is itself evidence for the bug report.
- **W2.2's scope is wider than written.** A hook-content scan must read the inline `command`
  strings in `.claude/settings.json`, not just files under a hooks directory. Three of `hops`'
  four hooks exist only as inline shell.

### 4. The gate is not enforced at the merge boundary — and no audit here measures that

Found while capturing the Scorecard baseline; verified independently of Scorecard from two GitHub
endpoints. `main` requires a PR and 1 approval and **zero passing status checks**
(`required_status_checks: {checks: [], contexts: [], enforcement_level: "off"}`; the enterprise
ruleset carries only `deletion`, `non_fast_forward`, `pull_request`). The `secret-scan` gitleaks
job, the SonarQube MR scan and the osv audit are all advisory at merge time.

Searching all 13 audit dimensions for any branch-protection or required-status-check concept
returns nothing: PRV-01/03/04/06 all assert that a gate **exists in CI**, never that it **blocks a
merge**. So `prevention-coverage` 81.5% measures the presence of prevention, not its force.

Two consequences:

- **A recommendation, not a PR.** Requiring `secret-scan` as a status check is a repository
  settings change needing an admin; our token is not one. It goes to the HOPS tech lead. It is
  also the highest-value thing Gate 0 surfaced.
- **A capability finding.** "The control exists" and "the control is enforced" are different
  measurements, and the audit tooling in use only makes the first. Scorecard's Branch-Protection
  check is the complement — the argument for running both. Full detail:
  `artifacts/scorecard-baseline-hops.md`.

## What the measurement checkpoint can actually claim

| Item | Measurable as an audit delta? | Evidence instead |
|---|---|---|
| W1.1 pnpm cooldown | **No** — SCS-04 is always skipped | Local reproduction: install of a <cooldown package fails |
| W1.2 un-gate osv audit | No dedicated check | CI run on an unlabeled PR + job coverage diff |
| W1.3 PRV-17 declaration | **Yes** — WARN 1/2 → PASS 2/2 | Audit re-run |
| W1.4 pin github MCP digest | No — AIS-04 already PASSes unpinned | `.mcp.json` diff + the W2.1 checker output |
| Hook relocation (new) | **Yes** — ADP-04 FAIL 0/5 → PASS, AIS-03 SKIP → runs | Audit re-run |
| W2.3 Scorecard | **Yes**, vs G0.3 | Baseline captured: aggregate 5.4/10. Compare per-check only — 4 checks are open-source norms that a private repo cannot and should not move, SAST 0 is a false negative, Signed-Releases is inconclusive. **Measured 2026-08-23** → `artifacts/scorecard-w2-3-evidence.md`: no check moved, aggregate still 5.4; the three merged PRs are invisible to Scorecard by construction |

Acceptance for the checkpoint stays as approved: **no dimension regresses.**
