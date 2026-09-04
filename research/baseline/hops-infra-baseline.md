# HOPS — infrastructure security baseline

Three repositories make up the HOPS infrastructure surface, all on GitHub `provectus-barhopping`
(GitLab is retired; the `hops/infra/README.md` pointer to it is stale):

| Layer | Repo | Measured at |
|---|---|---|
| Platform (VPC, EKS `internal-projects`, OIDC provider, ESO stores, CodeBuild runner projects and role) | `core-infra` | `main` **36a127633** 2026-08-28 — see `core-infra-baseline.md` |
| Project IaC | `hops-infra` | `main` **9ce74cd45** 2026-07-16 (42 commits past the retired GitLab head af090803c; every earlier claim re-verified here) |
| Application repo (Helm, Dockerfiles, GitHub Actions) | `hops` | `main` **63d0cc050** 2026-09-03 |

Snapshots: `scratch/cloud/src/{core-infra,hops-infra-gh,hops}/`. Scanner evidence:
`artifacts/cloud/trivy-misconfig-2026-09-03.md`, `artifacts/cloud/tflint-2026-09-03.md`. Control
coverage per repo: `cloud-control-scores.md`. Paths below are relative to each repo root.

## Layer 0 — platform (`core-infra`)

Summarised from `core-infra-baseline.md`: the EKS API endpoint is public with private access disabled and no
KMS envelope encryption for secrets; the External Secrets role reads every SSM parameter and Secrets Manager
secret in the account; one CodeBuild role serves all seven repos' GitHub Actions jobs, is `system:masters`,
and holds `iam:PassRole` / `lambda:UpdateFunctionCode` / `ecr:PutImage` on `*` behind a webhook filtered only
on `WORKFLOW_JOB_QUEUED`; zero CloudTrail / GuardDuty / Config / Security Hub / flow-log resources; no CI for
the platform repo itself. Coverage 24 %.

## Layer 1 — project IaC (`hops-infra`, `terraform/us-east-2/`, one account, one region)

### What is there, and holds up

| Control | Evidence |
|---|---|
| IRSA for every workload identity; no IAM users, no access keys | `modules/iam/hops-backend/main.tf` (`iam-assumable-role-with-oidc` 5.3.0, ×3 envs), `modules/iam/hop-sowa`, `modules/iam/hops-fin-service`, `modules/hops-prod/main.tf` cronjob role, `modules/alb-controller/main.tf`; grep `aws_iam_user\|aws_iam_access_key` → 0 |
| No `Action: "*"` anywhere | grep → 0; the only `Resource: "*"` grants are Bedrock invoke (3 roles) and the ALB-controller policy |
| Remote state encrypted and locked | `provider.tf` — S3 `provectus-internal-tfstate`, `encrypt = true`, `dynamodb_table = "provectus-internal-tflock"` |
| Exact provider pins + committed lockfile | `versions.tf`, `.terraform.lock.hcl` (aws 4.63.0, helm 2.9.0, kubernetes 2.19.0, gitlab 15.10.0; TF 1.3.9) |
| Aurora encrypted at rest, private subnets, SG ingress only from EKS workers, log export on | `modules/hops-rds/main.tf` — `storage_encrypted = true`, `aws_db_subnet_group` on `var.private_subnets`, ingress 5432 from `var.worker_security_group_id`, `enabled_cloudwatch_logs_exports = ["postgresql"]`, 7-day backups |
| Secrets are SSM Parameter Store references, never literals | `data.tf` — `/config/hop-project/{gitlab-details,slack-details,gitlab-vars,postgres-rds}`; six `ExternalSecret`s → `ClusterSecretStore/eso-paramstore` |
| Internal-only ALBs with TLS 1.2 policy and HTTP→HTTPS redirect | `modules/sonarqube/templates/values.yaml`, `modules/registry-mirror/templates/values.yml` — `scheme: internal`, `ssl-redirect: "443"`, `ELBSecurityPolicy-TLS-1-2-Ext-2018-06` |
| Bedrock cost/abuse alarms → Slack | `modules/cloudwatch/bedrock_alarms.tf` — four token-count alarms (daily and 1-minute) → SNS → AWS Chatbot |
| Chatbot commands capped at `ReadOnlyAccess` | `modules/chatbot-slack/main.tf` `guardrail_policies` |
| New buckets built right | `modules/hop-sowa-documents/main.tf` and `modules/gitlab-runners-cache/main.tf` — versioning (documents), AES256, full public-access block, lifecycle |
| S3 gateway endpoint on private route tables | `modules/s3-vpc-endpoint/main.tf` (added 2026-02) |
| MR template with a security checklist | `.gitlab/merge_request_templates/default.md` — four self-attested boxes |

### What is missing — verified at af090803c

| # | Gap | Evidence |
|---|---|---|
| I-1 | **No pipeline, ever.** No `.gitlab-ci.yml`, `.pre-commit-config.yaml`, `Makefile`, scanner config in the tree or in any commit (`git log --all --diff-filter=A`). Applies run from laptops with ambient credentials; commit `5dfa906 "fix terraform drift"` shows out-of-band change being reconciled by hand | repo tree at HEAD |
| I-2 | **The CI-variable pipeline was deleted in the GitHub migration and replaced with nothing.** At the GitLab head 35 variables (incl. `JWT_SECRET_PROD`, `HOPS_GOOGLE_SECRET_PROD`, `HUBSPOT_TOKEN_PROD`, `BW_MASTER`) were pushed unmasked and unprotected by `modules/gitlab-vars`; at the GitHub head the module call is gone, no `github_actions_secret`/`github` provider replaces it, so the same secrets are now hand-managed in GitHub settings outside any code review. The module directory and the `gitlab` provider requirement remain as dead code | `main.tf` (call removed), `versions.tf` (gitlab 15.10.0 still required), `modules/gitlab-vars/` |
| I-3 | **`sensitive = true` appears zero times.** SSM values → locals → GitLab variable values and the RDS password render in `plan` output | grep across `.tf` → 0 |
| I-4 | **ECR: `scan_on_push = false`, `image_tag_mutability = "MUTABLE"`, AES256 not CMK** — all eight repos (`hop-be`, `hop-fe`, `hop-sowa`, `hops-admin-fe`, `hops-mcp`, `hops-agent`, `sowa-admin-fe`, `sowa-mcp`) | `modules/ecr/main.tf`, `locals.tf` |
| I-5 | **Aurora: no `deletion_protection`, no parameter group so `rds.force_ssl` stays 0 (plaintext client connections accepted), no CMK, single instance, `publicly_accessible` not asserted** | `modules/hops-rds/main.tf` (module byte-identical since the stale snapshot; only `engine_version 16.6→16.11` at the call site) |
| I-6 | **Jaeger UI on the public zone behind HTTP basic auth**, Elasticsearch backend on plain HTTP with `password: changeme` (`values.yaml:133`, `provisionDataStore.elasticsearch: true`), `networkPolicy.enabled: false` | `modules/jaeger/locals.tf` (`jaeger.${var.domain}` with the public `hops.provectus.pro`), `modules/jaeger/templates/values.yaml:557-575` |
| I-7 | **Prod DB-dump pipeline**: ConfigMap script mounted `default_mode = "0777"`, `apt update && apt install -y awscli` from the internet on every nightly run, no `set -e` (a failed `pg_dump` still overwrites the previous dump), dump bucket `hops-prod-db-dump` with no SSE config, no public-access block, no TLS-only policy; new bare `hops-insights` bucket with no tags/SSE/PAB/versioning | `modules/hops-prod/main.tf` |
| I-8 | **IAM widened since 2025**: `sqs:SendMessage` to a cross-account queue in `060183668755` (scoped to one ARN — correct); ten SES identities; hops-backend gains `s3:*` on `hops-insights` (includes `PutBucketPolicy`, `PutBucketPublicAccessBlock`, `DeleteBucket`), plus cross-account RW on `provectus-hops-sql` and RW on `claude-code-tracking-shared-exports`; Bedrock stays `Resource: "*"`; preview and `hop-sowa-preview` roles trust **`system:serviceaccount:hops-preview-*:<sa>`** and, via `extra_namespaces`, **`hops-sowa-preview-*`** — any namespace with either prefix | `modules/iam/hops-backend/main.tf`, `modules/iam/hop-sowa/main.tf`, `main.tf` |
| I-9 | **Human role with RW+Delete on prod documents**: `Planner_Developers` (plain IAM role in the account) granted Get/Put/Delete/List on `hop-sowa-documents-dev` **and `-prod`**, no conditions | `modules/hop-sowa-documents/main.tf` bucket policy, `main.tf:263,280` |
| I-10 | **S3 gateway endpoint without an endpoint policy** (defaults to `*` — any bucket in any account is reachable through it) | `modules/s3-vpc-endpoint/main.tf` |
| I-11 | **ALB controller chart 1.5.2 (2023)** with the legacy policy: unconditioned `ec2:AuthorizeSecurityGroupIngress` / `Revoke` on `Resource: "*"` — the controller can open ingress on any security group in the account, including the RDS one | `modules/alb-controller/main.tf` (statements without the `elbv2.k8s.aws/cluster` tag condition) |
| I-12 | **CloudFront PostHog proxy accepts plaintext HTTP** (`viewer_protocol_policy = "allow-all"`, `minimum_protocol_version = "TLSv1"`), no WAF, no access logging, forwards PUT/PATCH/DELETE to a third-party origin | `main.tf` `aws_cloudfront_distribution.posthog` |
| I-13 | **ESO `refreshInterval = "0"` at all six `ExternalSecret`s** — a rotated SSM parameter never reaches the cluster | `modules/hops-prod/main.tf`, `modules/postgres/main.tf`, `modules/jaeger/main.tf` |
| I-14 | **Registry mirror unauthenticated** (registry 3.0.0 `configData` has no `auth:`; no Docker Hub credentials, so anonymous rate limits) — reachable from the whole VPC | `modules/registry-mirror/templates/values.yml` |
| I-15 | **Tags — fixed at the GitHub head**: provider-level `default_tags` with nine keys (owner, tech lead, repo, state file) replaced the `environment = staging` locals; residue: `local.default_tags` still passed explicitly to four modules and title-cased by `modules/ecr/locals.tf` (`Project = "Hops"` beside `"hops"`) | `provider.tf`, `main.tf:5,254,271,290` |
| I-16 | **Stale toolchain**: TF 1.3.9 (Feb 2023), aws provider 4.63.0 (Apr 2023) — Bedrock, ESO v1 and `use_lockfile` all post-date it; `.tflint.hcl` cannot load under any tflint since 0.54 (two incompatibilities, see the tflint artifact) | `versions.tf`, `.tflint.hcl` |
| I-17 | **No detective or preventive service in code**: zero `aws_cloudtrail`, `aws_guardduty_*`, `aws_config_*`, `aws_securityhub_*`, `aws_flow_log`, `aws_wafv2_*`, `aws_kms_key`, `aws_bedrock_guardrail`, `aws_bedrock_model_invocation_logging_configuration`; only interface endpoint is S3 | grep at HEAD → 0 — may exist in the platform repo or by hand (Prowler answers this) |
| I-18 | `.gitignore` is one line (`.terraform`) — no `*.tfvars`, `*.tfstate`, `crash.log` | `.gitignore` |
| I-19 | **Second literal password**: `monitoring_passcode = "adminpassword"` rendered into the SonarQube chart (chart now 2026.1.0 with Google SSO — the passcode is the metrics endpoint's) | `modules/sonarqube/locals.tf:8` |
| I-20 | Three dead module directories (`gitlab-vars`, `gitlab-runners-cache`, `loki_v2`); terraform-docs README still documents the GitLab variables module; root README points at GitLab | `modules/`, `terraform/us-east-2/README.md`, `README.md` |

Trivy default ruleset over the GitHub head: **67 FAIL** (2 CRITICAL, 33 HIGH), 34 distinct checks, 87.2 % pass-rate —
the S3 public-access-block family, ECR scan/mutability ×8, SNS without KMS, and the Helm-template pod security context.

## Layer 2 — Kubernetes deployment (`hops/helm/`, five charts)

| Control | State | Evidence |
|---|---|---|
| Pod / container `securityContext` | **none in any chart** — no `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, capability drop, seccomp | `grep -rniE "securityContext\|runAsNonRoot\|readOnlyRootFilesystem\|capabilities\|seccomp" helm/` → 0; Trivy: 97 FAIL (23 HIGH) as charts, 90 rendered with prod values |
| `values.yaml` | **none in any chart** — every value is a `--set` from the workflow, no schema, no defaults | `find helm -name 'values*.y*ml'` → 0 |
| IRSA wiring | present — `eks.amazonaws.com/role-arn` on the `hops` SA; `automountServiceAccountToken: true` set explicitly | `helm/hop-be/templates/service-account.yaml` |
| Secrets | External Secrets Operator → SSM `/config/hop-project/hops-be-{prod,dev}-secrets`, `refreshInterval: 15m`, `deletionPolicy: Retain` (`hop-be`); preview-db `refreshInterval: "0"` | `helm/hop-be/templates/external-secret.yaml`, `helm/hop-preview-db/templates/external-secret.yaml` |
| NetworkPolicy | one, prod `hop-be` only; egress `namespaceSelector: {}` (all namespaces); the monitoring/finservice selectors are set only by `hops-main.yml`, so on dev they render empty | `helm/hop-be/templates/network-policy.yaml`, `hops-dev.yml` |
| RBAC in preview/demo namespaces | `system:developers` gets `secrets: get,list` + `pods/exec` + `pods/portforward` | `helm/hop-preview/templates/rolebinding.yaml` |
| Ingress | ALB, `ssl-redirect: "443"`, `ELBSecurityPolicy-TLS-1-2-Ext-2018-06`, ACM cert by ARN, `tls: []`; preview `scheme: internet-facing` hardcoded; `alb.ingress.kubernetes.io/tags: Environment=dev,Project=HOP` on prod | `helm/hop-fe/templates/ingress.yaml`, `helm/hop-preview/templates/ingress.yaml` |
| Preview Postgres | `pgvector/pgvector:pg16` straight from Docker Hub (bypasses the mirror, never Grype-scanned), no `storageClassName`, no securityContext | `helm/hop-preview-db/templates/statefulset.yaml`, `pvc.yaml` |
| Chart linting / manifest scanning in CI | none — no `helm lint`, kubeconform, kube-linter, trivy, checkov | `.github/workflows/` |

## Layer 3 — images (`hop-backend/`, `hop-ui/`, `hop-agent/`, `hops-mcp`)

| Image | Base | Non-root | Notes |
|---|---|---|---|
| `hop-backend/Dockerfile` | `${REGISTRY}eclipse-temurin:21-jdk` | **no** | full JDK, no `HEALTHCHECK`; `ENTRYPOINT` interpolates `$POSTGRES_PASSWORD` into the java command line (visible in `/proc/<pid>/cmdline`) |
| `hop-ui/Dockerfile` | `${REGISTRY}nginx:stable-alpine` | **no** | nginx on :80 as root; CVE remediation by `apk del curl && apk upgrade libssl3` with rationale inline |
| `hop-agent/Dockerfile` | `${REGISTRY}node:24.13.0-alpine` | **yes** (`USER node`) | multi-stage, npm removed, `HEALTHCHECK` — the model |
| `hops-mcp/Dockerfile` | `${REGISTRY}node:22-alpine` | **yes** (`USER mcpserver`) | `HEALTHCHECK`; Trivy clean |
| all | tag-pinned via the internal mirror | — | no digests, no signing, no SBOM; `.dockerignore` omits `*.pem`, `*.key`, `credentials*`, `secrets*`, `.aws/` (all of which `.gitignore` treats as sensitive) |

## Layer 4 — CI to cloud (`.github/workflows/`, 11 workflows)

| Control | State | Evidence |
|---|---|---|
| AWS authentication | **ambient CodeBuild runner role** — `runs-on: codebuild-hops-{regular,compute}-…`; no `configure-aws-credentials`, no `id-token`, no static keys. The role and its policy are defined outside both repos | grep `configure-aws-credentials\|AWS_ACCESS_KEY\|role-to-assume` → 0 (one comment) |
| Blast radius of that role | one EKS cluster (`vars.EKS_CLUSTER_NAME`) for prod, dev, demo and every preview; the same runner pool runs `hops-mr-check.yml` on PR code and `aws eks update-kubeconfig` / `s3api get-object hops-prod-db-dump` / `ssm get-parameter --with-decryption` in deploy jobs | `hops-main.yml:209,267,311`, `hops-demo.yml:193,222-231` |
| `permissions:` | top-level only in `hops-scorecard.yml`; **none on any prod/dev/demo deploy job** | all workflows |
| Action pinning | ~50 tag-pinned uses; 2 SHA-pinned (scorecard); `curl … helm/helm/main/scripts/get-helm-3 \| bash` and Grype's `main/install.sh \| sh` in every deploy/scan job | `hops-main.yml`, `hops-mr-check.yml:264,319,397` |
| `issue_comment` triggers | `/deploy-admin`, `/destroy-admin`, stop-preview/demo — body match only, **no `author_association` check** | `hops-admin-deploy.yml`, `hops-admin-destroy.yml`, `hops-stop-*.yml` |
| `pull_request_target` | absent (good) | — |
| Secrets vs variables | four GitHub secrets (`GH_APP_*`, `PREVIEW_HOPS_CERT_ARN`, `SONAR_TOKEN`); **`USER_PASSWORD` is a variable**, reaches prod as a plain env var; preview password posted to the PR comment inside a sign-in URL | `hops-main.yml:218`, `hops-preview.yml:411-420` |
| Image tags | `:latest` **and** `prod-<sha>` pushed to prod ECR on every main merge; deploys reference the sha tag; `imagePullPolicy: IfNotPresent` | `hops-main.yml:153-194` |
| Prod data in non-prod | `s3api get-object --bucket hops-prod-db-dump` restored into demo namespaces on spot nodes; `docs/processes/development.md:125` says previews carry no production data | `hops-demo.yml:193-215` |
| Security gates that exist | gitleaks 8.24.3 (SHA256-verified, blocking), osv-scanner 2.3.5 (SHA256-verified), Grype on three images (CRITICAL blocks, installer unpinned), SonarQube, Scorecard ratchet, Dependabot incl. actions | `hops-mr-check.yml`, `hops-scorecard.yml` |
| Required status checks on `main` | **zero** — CODEOWNERS says so itself | `.github/CODEOWNERS` |
| Legacy GitLab CI still committed | `.gitlab-ci.yml` + `gitlab/ci/**`: dind with `DOCKER_TLS_CERTDIR: ""` on `tcp://localhost:2375`; not covered by CODEOWNERS | `.gitlab-ci.yml`, `gitlab/` |

## Layer 5 — process and documentation

- `docs/processes/security-notes.md` — accepted-risk register: AS-01 (cluster-internal plain HTTP, TLS at the ALB — "encrypting them properly means a service mesh, an infra decision tracked separately"), AS-09, PRV-01, AIS-04. Read before flagging any of those.
- `CLAUDE.md:102` "Infrastructure-first for prod: prefer env vars and AWS Parameter Store over editing application config files"; `.claude/rules/agent-config-surface.md` bans `curl | sh` in hooks and reads of `~/.aws` — the deploy workflows do the former.
- `scripts/claude-hooks/block-secrets.sh` blocks the coding agent from reading `.aws/`, `credentials*`, `service-account*`; it does **not** restrict `aws`/`kubectl`/`helm`/`terraform` commands.
- No document in `docs/` on cluster architecture, network design, encryption at rest, KMS, backups/DR, incident response or a threat model — the audit's AS-11 says the same.
- `.gitignore` credential coverage is strong (`*.pem`, `*.key`, `*.tfstate`, `.terraform`, `.auth/`, `.claude/settings.local.json`).

## Answered by core-infra; still open for Prowler

Answered (see `core-infra-baseline.md`): EKS endpoint public · no secrets KMS · flow logs absent · CloudTrail/GuardDuty/Config/Security Hub
absent in code · CodeBuild role = shared, `system:masters` · ESO role = account-wide · the public nginx ingress exists (chart 4.1.4), so
Jaeger's public hostname is live. Open until the live-account scan: whether any of the detective services was enabled by hand ·
control-plane log types and IMDSv2 as actually applied · whether `AWSChatbotRole-hops-chatbot` carries a permissions boundary.
