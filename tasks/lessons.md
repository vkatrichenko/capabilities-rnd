# Lessons

Corrections received, written as the rule that would have prevented the mistake. Review at session
start.

One entry per lesson: what went wrong in a sentence, then the rule. Keep the rule actionable — "be
careful with X" is not a rule; "verify X against Y before claiming Z" is.

---

## 2026-08-14 — Misread audit `score` as a percentage

Treated the AWOS audit's `score` field (32.6, 37.5, 45…) as percent-of-100 and called
prevention-coverage "the weakest area." It is a raw weight sum; the health metric is `coverage`
(awarded/applicable-max), and the real numbers were 80–100%. The wrong reading survived into
CLAUDE.md and a session report before being caught.

**Rule:** before quoting any metric from an unfamiliar report format, verify its semantics from
the data itself (recompute from raw fields, or find where the official report presents it) —
never infer meaning from a field name.

## 2026-08-14 — Lockfile grep pattern too narrow

Claimed "hop-ui has no lockfile" after grepping for `package-lock.json|yarn.lock|bun.lockb|
gradle.lockfile`. hop-ui uses **pnpm** — `pnpm-lock.yaml` existed all along. The claim survived
into two files before the audit's SCS-01 evidence contradicted it.

**Rule:** a negative claim ("X does not exist") needs an exhaustive pattern list for the
ecosystem (npm/pnpm/yarn/bun; poetry/uv/pipenv; gradle catalog/lockfile/verification-metadata) —
or better, assert from what IS there (the package manager in use) rather than from absence in a
hand-rolled pattern.

## 2026-08-18 — Treated a SKIPped audit check as a closeable gap

The approved Phase 2 plan said W1.1 "closes SCS-04". SCS-04 is `SKIP`/`applies:false` — the
detector cannot evaluate quarantine age offline and skips it by design, so no change to the repo
can flip it. The plan promised a before/after number that could never appear. Found only by
re-reading the audit JSON at Gate 0, after the plan was approved.

**Rule:** before planning work against an audit check, read that check's `status` and `applies`
fields *and its evidence strings* from the JSON — not the summary. `SKIP` means "not measured"
and `FAIL` means "measured and absent"; only the second is closeable. State up front which
planned items produce a measurable delta and which need their own evidence.

## 2026-08-19 — Read the skipped CI jobs, not just the failed one

On PR #515 the red check was a PR-template field. Fixing it would have closed the task. The
actual finding was in the jobs marked "skipping": frontend unit tests, SonarQube and the osv
audit all gate on a `frontend` label the PR did not carry, so a change to hop-ui's package
manager ran none of them. Phase 1 had recorded only the osv job as label-gated.

**Rule:** when reviewing a CI run, enumerate the skipped jobs and check each one's condition
against the diff. A gate that does not run is indistinguishable from a gate that passed in every
summary view, and "skipping" is the state nobody reads.

## 2026-08-19 — Branched from a clone that was 229 commits stale

The whole barley triage — 110 findings, every false positive classified — was
run against a local `main` that was 229 commits behind `origin/main`. It only
surfaced when creating the PR branch from `origin/develop`. On the real base the
count was 89, and 3 findings reported as "still in HEAD" had already been
scrubbed. Second occurrence: the hops Gate 0 baseline was pinned to a commit 5
days stale for the same reason.

**Rule:** `git fetch` and resolve the actual base ref **before** any measurement,
not before the commit. State the measured ref by SHA in the output
(`develop @ 230d4fa68`), so a stale number is visible instead of plausible.

## 2026-08-19 — Wrote the allowlist before triaging what it suppresses

The first `.gitleaks.toml` draft for barley copied hops' `regexTarget = "line"`.
The tuned scan returned 3 findings and looked like a clean result — but 3 real
`gitlab-rrt` tokens had been silently dropped by the allowlist, not by any rule
in it. Had the triage been done after writing the config instead of before, "6
real findings became 3" would have read as success.

**Rule:** for any suppression config — scanner allowlists, lint ignores, waiver
files — measure the untuned baseline first, then require every suppressed item to
be attributable to a named entry, and delete entries that match nothing. Pair it
with a planted-input control: put a synthetic positive inside each suppressed
context and confirm it is still detected. A suppression rule you have not proven
narrow is indistinguishable from a disabled check.
