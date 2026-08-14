# Cross-repo secret scan — 2026-08-14

**Tool:** gitleaks v8.24.3 (same version as the `hops` CI gate), default ruleset for all four
repos so the numbers are comparable. Full git history (`gitleaks git`). Non-mutating; all repos
verified clean in `git status` before and after.

**Redaction:** secret values never appear here — rule + file + date + first 4–6 chars + length
only. Raw JSON lives in `scratch/` (gitignored). Reproduce with:
`gitleaks git <repo> --no-banner --exit-code 0 --report-format json`.

**Not done, deliberately:** no found credential was tested for validity — that means using it.
Every "candidate" below needs an owner-side check: is/was it real, and if real, rotate.

## Headline numbers

| Repo | Commits scanned | Raw findings | Unique (file, secret) | Still in HEAD | High-confidence-format (unique) |
|---|---|---|---|---|---|
| hops | 6,375 | 31 | 20 | 1 (a false positive) | **2, both history-only** |
| barley | 7,982 | **3,934** | 3,658 | 93 | **22 — 8 still in HEAD** |
| hops-mcp | 264 | 3 | 2 | 1 (false positive) | 0 |
| sowinsights | 108 | 1 | 1 | 0 | 0 |

"High-confidence-format" = rules whose match can't be accidental: Slack `xoxb-`/`xapp-`/`xoxp-`,
GitLab runner token `GR1348941…`, AWS `ASIA…`, PEM `private-key` blocks, `jwt`.

## True-positive candidates — owner action needed

### barley — still in HEAD

| Rule | File | Date | Masked |
|---|---|---|---|
| gitlab-rrt | `tests/integration/fixtures/vcr_cassettes/gitlab_authentication.yaml` | 2026-03-27 | `GR1348…` (29) |
| gitlab-rrt | `tests/integration/fixtures/vcr_cassettes/gitlab_can_access_project.yaml` | 2026-03-27 | `GR1348…` (29) |
| slack-bot-token | `reports/smoke.html` | 2025-09-24 | `xoxb-6…` (57) |

The VCR cassettes are recorded HTTP interactions — the runner-registration token was captured from
a real exchange and committed. `reports/smoke.html` is a committed test report embedding a bot
token: a leak-via-artifact, exactly the AI-SDLC failure mode this capability is about.
(Two `atlassian-api-token` in-HEAD hits are false positives — the match is the class name
`JiraMissingCredentials…` in import statements.)

### barley — history-only (removed from HEAD, still in every clone)

| Rule | Files | Dates | Masked |
|---|---|---|---|
| slack-bot-token ×7 | `terraform/**/lambdas.tf`, `locals_lambdas.tf`, `test_lambda_packages.tf` (dev **and** production) | 2024-12 → 2025-07 | `xoxb-4…`/`xoxb-6…` (54–57) |
| slack-app-token ×5 | same Terraform files | 2025-03 → 2025-07 | `xapp-1…` (97) |
| slack-user-token | `terraform/us-east-1/locals_lambdas.tf` | 2024-12 | `xoxp-6…` (79) |
| private-key | `tests/credentials.json` | 2025-07-15 | full PEM (1,730) — service-account shaped |
| aws-access-token ×2 | `lambda_function/**/*.py` | 2025-04 | `ASIAVR…` (20) — STS temporary, self-expiring |

Slack tokens hardcoded in Terraform for ~8 months across dev and production configs, then removed —
removal does not revoke. **Rotation check is the action**, not further cleanup.

### hops — history-only

| Rule | File | Date | Masked |
|---|---|---|---|
| private-key | `hop-sowa/credentials/service-account.json` | 2026-04-07 | full PEM (1,730) — a complete service-account JSON was committed |
| slack-bot-token | `hop-server/src/main/resources/application.yml` | 2025-10-26 | `xoxb-4…` (54) |

Note the dates: both **pre-date or coincide with** the gitleaks CI gate introduced after audit
2026-07-17 (R7/PRV-01, per `.gitleaks.toml`). Nothing high-confidence entered `hops` history after
the gate. That is the before/after evidence for the article.

## False-positive profile (a finding in itself)

Default-config noise is severe and patterned — this is what a tuned config buys:

- **barley raw 3,934 → ~22 real candidates (99.4% noise).** Dominated by
  `a-rag-eval/.judge_cache/v1.jsonl` (3,473 hits — cache hashes as `generic-api-key`),
  `seed-db.sql` (156 — the loose `linkedin-client-id` regex matches any 14-char string near the
  word "linkedin", here `linkedinbio` marketing text), and Google Calendar `nextPageToken`s in
  cassettes.
- **hops' only in-HEAD hit** is `JwtTokenProvider.kt:227` — the constant name `MIN_…_BYTES` in a
  size comparison. Their tuned `.gitleaks.toml` correctly suppresses it: **worktree scan with
  their own config = 0 findings.** The gate is both present and calibrated.
- **hops-mcp / sowinsights**: env-var placeholders in curl docs and a Terraform secret *name* —
  effectively clean.

## What this proves for the capability

1. **The only gated repo is the only clean one.** `hops` post-gate history is clean;
   ungated `barley` accumulated 22 real-format credentials, 3 still in HEAD.
2. **Leak vectors are AI-SDLC-shaped**: recorded test cassettes, committed test reports/artifacts,
   IaC values pasted inline — not application source code.
3. **Default configs are unusable without tuning** (99.4% noise) — the tuned-allowlist pattern in
   `hops/.gitleaks.toml` (value-stopwords over path-allowlists) is the transferable practice.
