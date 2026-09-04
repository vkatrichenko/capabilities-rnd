# barley — infrastructure security baseline

Measured at `origin/develop` **548f0271f** (2026-09-03) from a `git archive` snapshot
(`scratch/cloud/src/barley/`); read-only. Stack: 253 `.tf` files, eight root stacks under
`terraform/us-west-2/` (`backend`, `base-shared`, `base-dev`, `base-prod`, `shared`, `development`,
`production`) plus a legacy `terraform/backend/` in us-east-1, 60+ modules under `terraform/modules/`.
Accounts referenced in code: `381492197841` (`shared/locals.tf:282`, SSO admin role ARN) and
`835124270895` (`development/locals.tf:36`). Region us-west-2. Every claim below names the file it was
read from; Trivy counts are in `artifacts/cloud/trivy-misconfig-2026-09-03.md`.

## What barley does well — the org's reference for several controls

| Control | Evidence |
|---|---|
| **CI → AWS by OIDC, zero static keys** | 16 workflows use `aws-actions/configure-aws-credentials@v6` with `role-to-assume: ${{ secrets.AWS_ROLE_ARN* }}` and `permissions: id-token: write`; `grep aws-access-key-id .github/workflows` → 0 |
| **Terraform plan/apply in CI with a gate** | `.github/workflows/terraform-validate.yml` (fmt + tflint), `terraform-plan.yml` → `reusable-terraform-plan.yml` (per-stack plan as PR comment), `terraform-apply.yml`; `ci.yml` aggregates `terraform-validate` + `terraform-plan` in `ci-gate` |
| **tflint in CI** | `.tflint.hcl` (aws ruleset 0.39.0, `recommended` preset) run by `terraform-validate.yml`; this research's own run: 0 issues, 0 errors |
| **Remote state encrypted + locked** | every stack: `backend "s3" { bucket = "proj-barley-terraform-state" … encrypt = true  use_lockfile = true }` (`us-west-2/production/providers.tf:15-21`) — S3-native locking, no DynamoDB |
| **KMS done properly** | `modules/kms/main.tf:147-150` `enable_key_rotation = true`; key policy splits management from data plane so a CI token cannot read audit-log ciphertext (`:26-30`); CloudWatch Logs principal scoped by `EncryptionContext` |
| **CloudTrail + GuardDuty (prod)** | `us-west-2/base-prod/cloudtrail.tf`, `base-prod/guardduty.tf`; `modules/cloudtrail/main.tf:52-62` log-file validation, global events, S3 data events for sensitive buckets; GuardDuty S3 + RDS login protection; alerts → EventBridge → SNS → Chatbot → Slack with a runbook (`docs/guides/security-alerts-runbook.md`) |
| **Secrets Manager, no literals** | `aws_secretsmanager_secret` in `production/main.tf:1-9`; ECS `task_secrets` → `valueFrom` (`modules/ecs/services/main.tf:35`); regex for `(password\|secret\|token\|api_key)\s*=\s*"` over `.tf` → 0 |
| **RDS master password managed** | `manage_master_user_password` (`modules/rds/main.tf:15`), RDS Proxy with `proxy_auth_secret_arns` |
| **Provider `default_tags` everywhere** | Project, Project_owner, Tech_lead, Devops_team, Managed_by, TF_state, aws-apn-id |
| **Private/public subnet split, NAT** | `modules/network/main.tf:29,53`; VPC endpoints (`modules/vpc_endpoint/`, `base-prod/vpce.tf`) |
| **`iam:PassRole` condition-scoped** | `iam:PassedToService` in `modules/iam_roles/main.tf:88-98` and `modules/github_oidc_provider/main.tf:79-88` |

## The gaps — each one undoes a control above

| # | Gap | Evidence | Why it matters |
|---|---|---|---|
| 1 | **`AdministratorAccess` attached to the GitHub Actions OIDC role, dev and prod** | `us-west-2/base-prod/locals.tf:48`, `base-dev/locals.tf:21` — last entry of `oidc_shared_policy_arns` is `github_oidc_administrator_access_policy_arn`, resolved in `modules/github_oidc_provider/main.tf:206-208` to `arn:aws:iam::aws:policy/AdministratorAccess` | The six least-privilege policies above it are moot. Any workflow run in the repo — including a PR-triggered one — is an account administrator |
| 2 | **GHA self-hosted runner task role = `AdministratorAccess`** | `modules/ecs/gha_runner/iam.tf:63-70` (deliberate, documented at `:8-10`) | PR-triggered test runs execute as admin |
| 3 | **ECS task role with `iam:*`, `ec2:*`, `secretsmanager:*`, `bedrock:*`, `dynamodb:*` … on `Resource=["*"]`** | `modules/iam_roles/main.tf:53-79`; the file's own comment (`:24-26`) acknowledges it | `iam:*` on `*` is full privilege escalation from the application container |
| 4 | **Same role for execution and task identity + ECS Exec enabled** | `modules/ecs/services/main.tf:9-10,73` | shell into a container that holds gap 3 |
| 5 | **RDS: no encryption at rest declared** | `modules/rds/main.tf:6-24` — no `storage_encrypted`, no `kms_key_id`, `skip_final_snapshot = true` (`:19`), no `deletion_protection`, no CloudWatch log exports | provider default is unencrypted for a fresh instance; a destroy drops the DB with no snapshot |
| 6 | **`modules/s3/v2` (used by prod and dev) creates buckets with no public-access-block and no SSE** | `modules/s3/v2/main.tf` — grep for both resources → 0; the state bucket in `us-west-2/backend/main.tf` likewise; SSE exists only commented out in legacy `terraform/backend/main.tf:24-31` | only three `aws_s3_bucket_public_access_block` resources repo-wide; the main app bucket relies on a deny-unless-allowlisted bucket policy (`production/main.tf:106-127`) instead |
| 7 | **Open-world security groups** | `base-prod/locals.security_groups.tf:23,32,38,47` — `0.0.0.0/0` ingress on 80 and 443 and all-ports egress; `modules/custom_security_groups/v2/variables.tf:26` defaults `cidr_ipv4` to `0.0.0.0/0` when a caller omits it | the module default makes open-world the path of least resistance |
| 8 | **No IaC *security* scanner** | tflint + `terraform fmt` only; no checkov/tfsec/trivy/terrascan/OPA; `.pre-commit-config.yaml` has no terraform hooks | nothing in CI catches gaps 1, 3, 5, 6 — Trivy default ruleset flags 530 FAILs, 16 CRITICAL, in one pass |
| 9 | **CloudTrail/GuardDuty prod only; no AWS Config, Security Hub, VPC flow logs** | `base-dev/` has no `cloudtrail.tf`/`guardduty.tf`; grep for `aws_config_`, `securityhub`, `aws_flow_log` → 0 | the dev account (which holds admin-capable CI roles, gap 1) has no detective controls |
| 10 | **Plan output posted to PR comments, `-lock=false`** | `reusable-terraform-plan.yml:56-64` (rationale documented) | full plan text — resource names, sometimes values — in PR history |
| 11 | **Containers: `USER` only in the `fastapi` stage** | `Dockerfile:69-72`; `slack_bot`, migrations and ~30 lambda stages run as root; base images tag-pinned, no digests | Trivy: 112 Dockerfile FAILs |
| 12 | **Provider pinning drifted across stacks; three stacks lack `.terraform.lock.hcl`** | aws `6.52.0` (production) vs `6.21.0` (base-*) vs `6.0.0` (backend); no lockfile in `base-dev`, `base-prod`, `base-shared`; `terraform/CLAUDE.md` still says 6.0.0 / 5.82.2 | reproducibility and stale-doc drift |
| 13 | **OIDC provider thumbprint placeholder** | `modules/github_oidc_provider/main.tf:4` `ffff…` | functionally fine since AWS validates GitHub's cert natively; flagged by every scanner |

## What the 2026-06-03 AWOS audit saw of this

Nothing. `context/audits/2026-06-03/security.md` (score 62 %, grade C) has five checks, all repository
hygiene (`.gitignore`, env templates, agent hooks, committed secrets). "Terraform" appears in that run
only as a topology fact (`project-topology.md:13`). The audit's one infra-adjacent line is the
still-open finding of a **production RDS password, LangSmith key and OAuth secret in
`.claude/settings.local.json` allow-patterns** (`security.md:31-37`, open since 2026-04-29 per
`recommendations.md:14`) — capability 1 territory, carried here because the password belongs to the
database in gap 5.

## Not verified

- Whether the live account matches the code (no AWS access to barley's accounts requested — out of the
  approved scope; the `proj-hops` account is the only one scanned live).
- Whether `AdministratorAccess` on the OIDC role is used by any workflow step that could not run with the
  six scoped policies — the trace through `cd.yml` was not done.
- The state bucket's *actual* SSE and public-access settings (AWS applies defaults since 2023; the code
  simply does not assert them).
