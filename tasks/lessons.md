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
