# core-infra — the platform baseline (VPC, EKS, CI identity, secrets store)

GitHub `provectus-barhopping/core-infra`, `main` **36a127633** (2026-08-28), snapshot
`scratch/cloud/src/core-infra/`, read-only. This is the repo that owns `provectus-internal-tfstate`
key `terraform/states/internal.tfstate` — the state every project repo reads for VPC, subnets, EKS
`internal-projects` and the OIDC provider. Root `terraform/us-east-2/`, 33 module calls plus a dozen
dead module directories. Paths relative to the repo root. Trivy: 73 FAIL (12 CRITICAL) / 94.1 % pass;
control coverage **24 %** (`cloud-control-scores.md`).

## What holds

| Control | Evidence |
|---|---|
| Account context (verified live 2026-09-04) | Member account of the IT-managed organization `060183668755`, all features enabled; every human signs in through AWS SSO with role assumption; root holds no access keys. CloudTrail and AWS Config arrive from that management account |
| Exact provider pins, TF 1.5.7, full lockfile with hashes | `terraform/us-east-2/versions.tf`, `.terraform.lock.hcl` (aws 6.0.0, kubernetes 2.20.0, helm 2.10.0) |
| State encrypted and locked; lock table in code | `providers.tf` (`encrypt = true`, `dynamodb_table = "provectus-internal-tflock"`), `aws_dynamo_state_lock.tf` |
| Private subnets for nodes and builds, public only for the NLBs | `modules/network/main.tf` (vpc 5.1.0, `10.10.0.0/16`, 6 private subnets) |
| IRSA / Pod Identity for platform add-ons, some fully qualified | `modules/monitoring/loki/main.tf` (`:sub` + `:aud`), `modules/cert-manager/main.tf` (EKS Pod Identity) |
| EKS 1.34 on the current module (v21.0.4), AL2023 nodes | `modules/kubernetes/main.tf`, `modules.tf:1-279` |
| Provider-level `default_tags` with owner, tech lead, repo, state file | `providers.tf` (9 keys) |
| `system:developers` RBAC namespaced, `secrets: list` only (names, not values) | `modules/rbac/main.tf`, `locals.tf:66-113` |
| Public ingress fronted by cert-manager Let's Encrypt; Grafana behind Google OAuth | `modules/cert-manager/`, `modules/monitoring/prometheus/templates/grafana.yaml` |
| Alertmanager → Slack for hops dev/prod | `modules/monitoring/prometheus/templates/alertmanager.yaml`, `locals.tf:159-163` |

## What does not — verified by hand at 36a127633

| # | Gap | Evidence |
|---|---|---|
| P-1 | **One CodeBuild role for seven repos, and it is cluster-admin.** `codebuild-hops-aws-iac` is `service_role_arn` for all 7 projects (`hops-regular`, `hops-compute`, `hops-admin`, `hops-finservice`, `hops-mcp`, `hops-sowa`, `hops-sowinsights`); mapped to `system:masters` in aws-auth; policy has `iam:PassRole` + `ecs:RegisterTaskDefinition` + `ecs:UpdateService` on `*` (escalation to any role), `lambda:UpdateFunctionCode` on `*`, `ecr:PutImage` on `*` (any repo's prod image), `s3:GetObject` on `hops-prod-db-dump/*`, the CodeConnections token; every project `privileged_mode = true`; the webhook's only filter is `WORKFLOW_JOB_QUEUED` — no actor, no branch; trust policy has no `aws:SourceArn` | `modules.tf:519-628`, `modules/codebuild_iam/main.tf`, `modules/codebuild/main.tf:85`, `modules/kubernetes/main.tf:113-117` |
| P-2 | **EKS API public to the internet**: `endpoint_public_access = true`, `endpoint_private_access = false`, no `endpoint_public_access_cidrs` (module default `0.0.0.0/0`) | `modules/kubernetes/main.tf:6-8` |
| P-3 | **No envelope encryption for cluster secrets**: `create_kms_key = false`, `encryption_config = null`; zero `aws_kms_key` in the repo | `modules/kubernetes/main.tf:23-24` |
| P-4 | **External Secrets can read every secret in the account**: `ssm:GetParameter*` on `parameter/*`, `secretsmanager:GetSecretValue` on `secret:*`; one shared SA for both `ClusterSecretStore`s; IRSA trust without `oidc_fully_qualified_subjects` | `modules/external-secrets/main.tf:50,58` |
| P-5 | **Detective controls: half inherited, half owned by nobody.** Verified live 2026-09-04 — CloudTrail is *centrally provided and correct* (two organization trails from the management account `060183668755`: multi-region, log-file validation on, KMS-encrypted) and AWS Config runs from an organization CloudFormation StackSet, so their absence from this repo is right, not a gap. Genuinely absent everywhere: **GuardDuty, Security Hub, IAM Access Analyzer, VPC flow logs**, the account-level S3 public-access block, EBS default encryption and the password policy — IT has not pushed them down and no project declares them. Local litter: a non-organization trail `management-events-test` still logging without validation or KMS. Budget module written, both callers commented out | repo grep → 0; `modules.tf:476-497`; live: `../../artifacts/cloud/prowler-2026-09-04.md` |
| P-6 | **No CI for the platform repo itself**: no `.github/`, no pipeline, `.tflint.hcl` unexecuted, a GitLab MR template in a GitHub repo | repo tree |
| P-7 | **`Planner_Developers` trusts the whole account** (`Principal.AWS = 941000539201`, `Condition: {}`) and carries `lambda:*`, `events:*`, `scheduler:*`, `ssm:PutParameter` on `/config/hop-project/*`, `secretsmanager:DeleteSecret` on `secret:sow-*`, `logs:Unmask`; module is dead code but the role is live (referenced by aws-auth) | `modules/iam/role/planner-developers/main.tf`, `modules/kubernetes/main.tf:108-112` |
| P-8 | **Legacy GitLab runners still deployed**: two service accounts bound to `cluster-admin`, `privileged = true` with a rw `/sys/fs/cgroup` hostPath, IRSA roles with `ssm:GetParameter` on `*`, `ecr:PutImage` on `*`, `iam:PassRole` on `*`, prod dump read | `modules/gitlab/helm-runner/main.tf:57-65,165-180`, `helm-compute-runner/main.tf`, `modules.tf:501,510` |
| P-9 | **Committed credentials in a dead module**: six `base64encode("…")` literals — a Bamboo service-account password, staging and **production Google OAuth client secrets**, a staging Postgres password — in `modules/parameter-store/locals.tf`; module uncalled, values in every clone's history. Rotate | `modules/parameter-store/locals.tf` (6 literals; values not reproduced here) |
| P-10 | Node instance roles carry `Route53FullAccess`, `ECRFullAccess`, `ELBFullAccess`, `EFSFullAccess` on all five node groups | `modules.tf` `iam_role_additional_policies` ×5 |
| P-11 | `ingress-nginx` chart **4.1.4** (2022) on an internet-facing NLB — years of controller CVEs; `kubernetes-dashboard` dead module with `--enable-skip-login` and `clusterAdminRole: true` | `modules/ingress/nginx/`, `modules/kubernetes-dashboard/values.yaml` |
| P-12 | Grafana public with `allow_sign_up: true` and a local admin password that bypasses SSO; the Secrets Manager seed ships `grafana_password: changeme` under `ignore_changes`; Prometheus and Alertmanager on plain HTTP, no auth, internal NLB | `modules/monitoring/prometheus/templates/grafana.yaml`, `aws_secretsmanager.tf` |
| P-13 | Control-plane log types and IMDSv2 never asserted (module defaults assumed); `coredns`/`kube-proxy`/pod-identity addons `most_recent`; `vpc-cni` pinned to an old build against 1.34 | `modules/kubernetes/main.tf`, `modules.tf` |
| P-14 | Default SG / NACL / route table explicitly unmanaged; single NAT; Loki bucket without SSE/PAB/versioning; state bucket not managed in code | `modules/network/main.tf`, `modules/monitoring/loki/main.tf` |

## Why this repo decides the others' scores

Every "ambient CodeBuild role" cell in the app repos resolves here to P-1; every "cluster is platform-level"
cell resolves to P-2/P-3; every "secrets from a store" pass in the app repos sits on top of P-4. The platform
is where the org's CI-to-cloud trust boundary actually lives, and it is the least-covered repo of the seven.
