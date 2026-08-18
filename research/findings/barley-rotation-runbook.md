# `barley` credential rotation — triage and runbook

Prepared 2026-08-18 against `barley` @ `2682dcb13` (`main`, 2026-08-12), read-only. Values are
never printed: each credential is identified by a **fingerprint** = first 12 hex of
`sha256(token)`, which lets owners match a token they hold without either side pasting it.

**Ownership.** `barley` is read-only for this research and out of our change scope. Everything
below is for the `barley` owners to execute. Our part is the triage and this runbook.

**Not done, deliberately: no credential was tested for validity.** Testing means using it. Every
"is it live?" question below is an owner-side check.

## The inventory — what and where

7 real-format credentials. 3 further matches are placeholders (`xoxb-…`×2, `xapp-…`×1, all
low-entropy) and need no action.

### Still in HEAD — anyone with clone access reads these today

| # | Fingerprint | Type | Location | Since | Exposure |
|---|---|---|---|---|---|
| 1 | `f62a79951399` | Slack **bot** token (`xoxb-`, 57) | `reports/smoke.html` line 432 | `fc96e4948` 2025-09-23 "[IGAL-1133] e2e tests for Smoke" | **~11 months** |
| 2 | `9fdc599e224f` | GitLab **runner registration token** (`GR13…`, 29) | `tests/integration/fixtures/vcr_cassettes/gitlab_authentication.yaml` L71; `…/gitlab_can_access_project.yaml` L71 + L135 | `d9dde1ead` 2026-02-10 "IGAL-1815: Re-record VCR cassettes with real DEV credentials" | **~6 months** |

Target of #2 is identifiable from the cassettes: `https://gitlab.provectus.com`, project
`process-automation/ppsa` (project id `1407`).

Target of #1 is identifiable from the surrounding test log: `tests/smoke/test_e2e_slack.py`,
fixture `smoke_slack_cfg`, bot user `U07B7QG7YDU`, channel `C08QDF63ZH8`.

### History-only — removed from HEAD, present in every existing clone and fork

| # | Fingerprint | Type | Where it lived | Window | Note |
|---|---|---|---|---|---|
| 3 | `2c86d0833991` | Slack **app-level** token (`xapp-`, 97) | `terraform/us-west-2/**production**/lambdas.tf`, `…/development/lambdas.tf`, `terraform/development/us-east-1/**`, `terraform/modules/lambdas/locals.tf` | 2025-03-07 → 2026-07-22 | **~16 months, production** |
| 4 | `420cfda1c4b8` | Slack **bot** token (`xoxb-`, 54) | same files | 2025-03-07 → 2026-07-22 | **~16 months, production** |
| 5 | `47acd808b9ac` | Slack **bot** token (`xoxb-`, 57) | `terraform/us-east-1/locals_lambdas.tf` | 2024-12-02 → 2024-12-23 | 3 weeks |
| 6 | `3fd1ab97673a` | Slack **user** token (`xoxp-`, 79) | `terraform/us-east-1/locals_lambdas.tf` | 2024-12-02 → 2024-12-23 | 3 weeks |
| 7 | `5727d6857923` | AWS **STS temporary** key (`ASIA…`) | `lambda_function/**/*.py` | 2025-04 | **Self-expiring — no action** |

#3 and #4 were removed on 2026-07-22 by `5c571dcf1` *"Remove hardcoded Slack bot tokens; use
Secrets Manager data"* — a correct fix that **does not revoke anything**. If they were never
rotated, they are live, and that commit message is a signpost pointing straight at them.

### Also on the rotation list, from barley's own audit

The 2026-06-03 audit (`context/audits/2026-06-03/security.md`) found a **production RDS
password**, a **LangSmith API key** and an **AgentCore OAuth client secret** in plaintext
allow-patterns in `.claude/settings.local.json` — gitignored, on developer disks, never
committed. Rotation was recommended then; status unknown. That file is **not** present in this
clone, so it cannot be re-verified from here — it is a per-developer-machine check.

## Step 0 — notify, before touching anything

Not a formality. Two reasons it comes first:

1. **Rotation causes an outage if uncoordinated** (see step 2c) — production Lambdas carry these
   tokens as environment variables.
2. **A cleanup PR is a public pointer at a live credential.** A PR titled "remove leaked Slack
   token from smoke report" tells every reader exactly which commit to look in, and the token is
   still valid until rotated. Rotate first, clean second. This has already happened once:
   `5c571dcf1`'s message announces the removal.

Notify: `barley` owners (via Ruslan / Rodion), plus whoever administers the Provectus Slack
workspace and the `gitlab.provectus.com` `process-automation` group — rotation needs their
access, not the repo's.

## Step 1 — decide, per credential (owners)

For each of #1–#6: **is it still valid?** Check in the issuing system's own UI — do not call an
API with the token to find out. Then:

- **Valid** → rotate (step 2). Non-negotiable for #3 and #4: production, 16 months, in history.
- **Already rotated / revoked** → record that against the fingerprint and stop. No cleanup needed
  for the history-only ones.
- **Cannot determine** → treat as valid.

## Step 2 — rotate (no PR; console and CLI work)

**None of this is a code change.** It happens in Slack, GitLab and AWS.

**2a. Slack (#1, #3, #4, #5, #6)** — api.slack.com/apps → the Barley app:
- bot tokens (`xoxb-`): *Install App* → **Reinstall to Workspace**; this issues a new bot token
  and invalidates the previous one. Confirm the old one is dead before proceeding.
- app-level token (`xapp-`): *Basic Information* → **App-Level Tokens** → delete the old, create
  a replacement with the same scopes.
- user token (`xoxp-`, #6): revoke the authorization for that user; re-authorize if still needed.

**2b. GitLab (#2)** — `gitlab.provectus.com` → `process-automation/ppsa` → *Settings → CI/CD →
Runners* → **reset the registration token**. On GitLab 16+ where registration tokens are
deprecated in favour of runner authentication tokens, the equivalent action is to delete the
affected runner and re-register it. Any runner still using the old token stops registering —
that is the intended effect, and the reason to warn the pipeline owners first.

**2c. Propagate to AWS — the step that is easy to miss.** The new Slack values go into Secrets
Manager (`slack/bot`, keys `bot_token` / `app_token`, per environment). **Updating the secret is
not enough.** In `terraform/us-west-2/{development,production}/lambdas.tf` the tokens are read
through a `data "aws_secretsmanager_secret_version"` and injected as **Lambda environment
variables**:

```
SLACK_APP_TOKEN = jsondecode(data.aws_secretsmanager_secret_version.slack_bot_token.secret_string)["app_token"]
SLACK_BOT_TOKEN = jsondecode(data.aws_secretsmanager_secret_version.slack_bot_token.secret_string)["bot_token"]
```

Those values are resolved at **apply** time and baked into the function configuration. Running
Lambdas keep the old token until a `terraform apply` re-reads the secret. So rotation is a
coordinated deploy in dev and prod, not a console click — plan a window.

(Worth a follow-up of its own: reading the secret at **runtime** instead of injecting it as an
env var would make future rotations a secret update with no deploy, and would keep the token out
of the Lambda configuration where `GetFunctionConfiguration` can read it.)

## Step 3 — clean HEAD (one PR, owned by barley)

Only #1 and #2 are in HEAD. This is the only part that is a pull request.

- `reports/smoke.html` — **delete it.** It is the sole committed file under `reports/`, a
  one-off pytest-html artifact from 2025-09-23; nothing references it. Add `reports/` to
  `.gitignore` (the existing "Unit test / coverage reports" section does not cover it).
- The two cassettes — re-record with a scrubbed value, or hand-edit the `runners_token` field to
  a placeholder. **Sweep all 85 cassettes** while there, not just the two known ones: the
  scrubber gap that let this through is field-name-based, so other response fields may carry
  other values.

## Step 4 — history: rotate, don't rewrite

Recommendation: **do not rewrite history.** ~8,000 commits, an unknown number of clones and
forks, and every rewrite invalidates them all. Rotation is the actual remedy — once a credential
is dead, its presence in history is an artifact, not a risk. Rewriting *without* rotating fixes
nothing while looking like it did.

Revisit only if a rotation turns out to be impossible for some credential.

## Step 5 — prevention (otherwise this recurs)

Three specific causes, three specific fixes:

1. **`reports/smoke.html`: pytest-html embeds fixture reprs of failing tests.** The token was
   never in source — it was in a fixture dict that the HTML reporter serialized into the failure
   log. Fix: `reports/` in `.gitignore`, and treat generated reports as build artifacts.
2. **The cassettes: fail-open scrubbing.** `tests/integration/conftest.py` filters request
   *headers* well (`Authorization`, `PRIVATE-TOKEN`, `x-api-key`, cookies) but scrubs response
   *bodies* with a **key denylist** (`access_token`, Zoom fields, emails). GitLab's project
   response returns the token under `runners_token`, which is not on that list. Every new API
   field is a new hole. Fix: make it fail-closed — an allowlist of fields kept, or
   format/entropy-based scrubbing (the same rules gitleaks uses) applied at record time.
3. **No secret-scanning gate anywhere in barley.** Both leaks above are defence-in-depth
   failures: a scrubber has a hole, and nothing behind it catches the result. `barley` already
   runs `.pre-commit-config.yaml` (pre-commit-hooks, ruff, biome, and a local
   `pii-scan-evals-datasets` scanner), so adding gitleaks is a few lines in a framework that is
   already installed — plus the CI job, which is the layer that actually gates.

The `hops` port recipe for #3 (`.gitleaks.toml` tuning, the advisory local hook, the CI job) is
in `research/baseline/hops-security-baseline.md`. Note `hops` gates it in CI but does **not**
require the check to merge — see `artifacts/scorecard-baseline-hops.md` finding 1. Requiring it
is the part worth copying deliberately rather than inheriting.

## Verification, per step

| Step | Done when |
|---|---|
| 1 | Every fingerprint #1–#6 has a recorded verdict: valid / already-rotated / assumed-valid |
| 2a/2b | The issuing system shows a new credential and the old one rejected |
| 2c | `aws lambda get-function-configuration` shows the new value in dev **and** prod |
| 3 | `git ls-files reports/` is empty; a fresh gitleaks run over HEAD returns 0 real-format findings |
| 4 | N/A — explicitly not doing it |
| 5 | A commit containing a test-shaped token is rejected by pre-commit **and** by CI |

## What this runbook does not cover

- Whether any credential was actually used by an outsider. That needs Slack/GitLab audit logs
  over the exposure windows above — an owner task, and the reason the windows are stated.
- The `.claude/settings.local.json` credentials: not in this clone, per-developer-machine check.
- `barley`'s Terraform and infrastructure posture generally — out of scope for this research.
