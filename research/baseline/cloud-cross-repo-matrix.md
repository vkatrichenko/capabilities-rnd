# Cloud infrastructure controls — cross-repo matrix

> Scored version with percentages: `cloud-control-scores.md`. Live-account answers: `../../artifacts/cloud/prowler-2026-09-04.md`.

Seven code surfaces, one org, measured 2026-09-03/04 on GitHub (all repositories now live on `provectus-barhopping`; the GitLab clones used on 09-03 are retired and every claim was re-verified at the GitHub heads) from `git archive` snapshots at the refs below. Every
cell names its proof; "outside repo" means the control is not asserted in that code base and may or
may not exist in the account (the live-account scan answers that, not the code). Detail per repo:
`hops-infra-baseline.md`, `barley-infra-baseline.md`, and the sow-insights-infra survey folded into
`../findings/cross-repo-infra-findings.md`.

| Surface | Ref | Account / region |
|---|---|---|
| **core-infra** (platform: VPC, EKS, CodeBuild runners, ESO, ingress) | `main` 36a127633 2026-08-28 | 941000539201 · us-east-2 — see `core-infra-baseline.md` |
| **hops-infra** (project IaC, GitHub; the GitLab clone is retired) | `main` 9ce74cd45 2026-07-16 | 941000539201 · us-east-2 |
| **hops app** (`provectus-barhopping/hops`: Helm, Dockerfiles, GHA) | `origin/main` 63d0cc050 2026-09-03 | same account, EKS `internal-projects` |
| **barley** (`terraform/`, 253 `.tf`) | `origin/develop` 548f0271f 2026-09-03 | 381492197841 / 835124270895 · us-west-2 |
| **sow-insights-infra** (GitLab `internal-projects-iac/sow-insights-infra`) + **sowinsights** app | `main` ffb4070a6 2025-06-10 · `origin/main` b12880d31 | 941000539201 · us-east-1 (ECS Fargate) |
| **hops-mcp** (Helm + Dockerfile only) | `origin/main` 352b091b7 2026-08-31 | 941000539201 · us-east-2 |

Legend: ✅ present and asserted in code · ⚠️ partial · ❌ absent · ⬜ outside repo / unknown · — not applicable

## Identity and CI-to-cloud

| Control | hops IaC | hops app | barley | sow-insights-infra / app | hops-mcp |
|---|---|---|---|---|---|
| CI reaches AWS without static keys | ⬜ no CI at all; applies from laptops (no `.gitlab-ci.yml` in any commit) | ⚠️ ambient CodeBuild runner role (`runs-on: codebuild-hops-*`); role defined nowhere in code | ✅ OIDC, `configure-aws-credentials@v6`, 16 workflows, 0 static keys | ⚠️ ambient CodeBuild role; no `aws_codebuild_project`, no OIDC provider, no IAM user in the IaC — the push identity is unmanaged | ⚠️ ambient CodeBuild role |
| CI role least-privileged | ⬜ | ⬜ role invisible; observed doing `eks update-kubeconfig`, prod dump `get-object`, `ssm --with-decryption` | ❌ **`AdministratorAccess`** on the OIDC role in dev and prod (`base-{dev,prod}/locals.tf`) and on the GHA runner task role | ⬜ | ⬜ |
| Workload identity (IRSA / task role), no `Action:"*"` | ✅ IRSA ×5, no `Action:"*"`; ⚠️ Bedrock `Resource:"*"`, `s3:*` on one bucket, wildcard-namespace trust for preview roles | ✅ SA annotated; ⚠️ `hop-agent` reuses the full backend role | ❌ task role `iam:*`, `ec2:*`, `secretsmanager:*` on `*` (`modules/iam_roles/main.tf:53-79`) | ✅ two roles, six explicit Bedrock model ARNs, Secrets Manager scoped to `secret:sow-*` | ✅ (via hops IaC) |
| Human access to prod data | ❌ `Planner_Developers` RW+Delete on prod documents bucket | ❌ `system:developers` `secrets get,list` + `pods/exec` in preview namespaces | ⬜ | ⬜ | — |
| Org guardrails (SCPs, permission boundaries) | ❌ boundary variable exists on the chatbot role, never set | — | ⬜ | ❌ | — |

## Data and state

| Control | hops IaC | hops app | barley | sow-insights-infra | hops-mcp |
|---|---|---|---|---|---|
| Terraform state encrypted + locked | ✅ SSE-S3 + DynamoDB; ❌ no CMK; state holds RDS password + 35 CI secrets unmarked `sensitive` | — | ✅ `encrypt` + `use_lockfile`; ❌ state bucket itself has no SSE/PAB resource | ⚠️ 941 root: SSE-S3 + DynamoDB; `develop` root: **no lock**; lockfile gitignored | — |
| Database encryption / TLS / deletion protection | ⚠️ `storage_encrypted` ✅, CMK ❌, `rds.force_ssl` ❌, `deletion_protection` ❌, single instance | — | ❌ `storage_encrypted` absent, `skip_final_snapshot = true`, no deletion protection (`modules/rds/main.tf`) | — (no DB) | — |
| S3: public-access block + SSE on every bucket | ⚠️ new buckets ✅; prod dump bucket ❌ (no SSE/PAB), `hops-insights` ❌ (bare) | — | ❌ `modules/s3/v2` (prod) has neither; 3 PAB resources repo-wide | ⚠️ develop buckets PAB ✅ SSE ❌ | — |
| Secrets from a store, never literals | ✅ SSM → ESO; ⚠️ `refreshInterval: "0"`; ⚠️ Jaeger ES `password: changeme` live | ✅ ESO → SSM, 15 m refresh; ❌ `USER_PASSWORD` is a GitHub *variable* | ✅ Secrets Manager + `valueFrom` | ✅ secret *name* in env, resolved at runtime | ✅ ESO → SSM |
| Customer-managed KMS anywhere | ❌ zero `aws_kms_key` | — | ✅ `modules/kms` with rotation and CI plane split | ❌ | — |

## Network and edge

| Control | hops IaC | hops app | barley | sow-insights-infra | hops-mcp |
|---|---|---|---|---|---|
| Workloads in private subnets | ✅ (subnets from platform state) | ✅ | ✅ `modules/network` | ✅ Fargate in private subnets, single NAT | ✅ |
| No `0.0.0.0/0` ingress | ✅ only egress is open (RDS SG) | — | ❌ 80+443 open on prod/dev ingress SG; module default CIDR `0.0.0.0/0` | ❌ 80+443 open on the service SG, reachable via peering routes into every route table of the shared corporate VPC | — |
| Public exposure limited to the app ALB | ❌ Jaeger UI public on `jaeger.hops.provectus.pro`, basic auth | ⚠️ preview ALB `internet-facing` hardcoded | ⬜ | ✅ no load balancer at all | ⬜ |
| TLS policy | ⚠️ TLS-1.2-2018 policy on internal ALBs; ❌ CloudFront `allow-all` / `TLSv1` | ⚠️ TLS-1.2-2018 | ⬜ | — | ⬜ |
| WAF | ❌ permissions granted to the controller, no ACL created | ❌ | ⬜ | — | — |
| VPC flow logs | ⬜ VPC lives in platform state | — | ❌ | ❌ `enable_flow_log` unset | — |
| VPC endpoints | ⚠️ S3 gateway only, **no endpoint policy**; no Bedrock endpoint | — | ✅ (`modules/vpc_endpoint`, policies `s3:*` on `*`) | ❌ none | — |

## Workload and image supply chain

| Control | hops IaC | hops app | barley | sow-insights-infra / app | hops-mcp |
|---|---|---|---|---|---|
| Pod `securityContext` (non-root, RO fs, drop caps) | ❌ in-cluster Postgres statefulset | ❌ zero in five charts (Trivy 97 FAIL, 23 HIGH) | — (ECS) | ❌ sowinsights chart (Trivy 18 FAIL) | ❌ 31 FAIL once rendered — chart fails to render by default, so Trivy reports 0 |
| Container runs non-root | — | ❌ `hop-backend`, `hop-ui`; ✅ `hop-agent` | ❌ root in all but the `fastapi` stage | ❌ `python:3.11-bullseye`, no `USER` | ✅ `USER mcpserver` |
| ECR scan on push / immutable tags | ❌ `scan_on_push = false`, `MUTABLE`, 5 repos | — | ❌ same module ×27 (Trivy: 108 + 108) | ❌ defaults (false / MUTABLE), `:latest` deployed | (via hops IaC) ❌ |
| Image scan in CI | — | ✅ Grype, CRITICAL blocks (installer unpinned) | ❌ | ❌ | ⬜ |
| Signing / SBOM / digest pinning | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pinned CI tooling | — | ❌ `curl … main … \| bash` for helm and Grype; ✅ gitleaks/osv SHA256-verified | ⚠️ tag-pinned actions | ❌ | ⚠️ |

## Detection and governance

| Control | hops IaC | hops app | barley | sow-insights-infra | hops-mcp |
|---|---|---|---|---|---|
| IaC security scan in CI | ❌ no CI | ❌ no trivy/checkov/kube-linter/`helm lint` | ❌ tflint + fmt only | ❌ no CI | ❌ |
| Terraform plan reviewed before apply | ❌ | — | ✅ plan as PR comment, apply job | ❌ `terraform apply -auto-approve` from a Makefile with a personal profile | — |
| CloudTrail / GuardDuty / Config / Security Hub | ❌ none in code | — | ⚠️ CloudTrail + GuardDuty **prod only**; no Config / Security Hub | ❌ none | — |
| Tagging standard | ❌ two keys, wrong `environment` on prod, three spellings | ❌ `Environment=dev` on prod ingress | ✅ seven keys via `default_tags` | ⚠️ `default_tags` but `Environment=production` vs `env=dev` | — |
| Provider / TF currency | ❌ TF 1.3.9, aws 4.63.0 (2023) | — | ⚠️ aws 6.x, drifted across stacks, 3 stacks without lockfile | ⚠️ aws 5.89 (941), 5.3 (develop); lockfile gitignored | — |
| Audit coverage of infra (AWOS) | ❌ no infra dimension | ❌ | ❌ `security.md` is repo hygiene only | ❌ never audited | ❌ never audited |
| Accepted-risk register | — | ✅ `docs/processes/security-notes.md` | ❌ | ❌ | ❌ |

## AI workload on AWS (Bedrock)

| Control | hops IaC | barley | sow-insights-infra |
|---|---|---|---|
| Invoke scoped to model ARNs | ❌ `Resource: "*"` (3 roles) | ❌ `bedrock:*` on `*` | ✅ six explicit ARNs |
| Guardrails (`aws_bedrock_guardrail`, `ApplyGuardrail`) | ❌ | ❌ | ❌ |
| Model invocation logging | ❌ | ❌ | ❌ |
| PrivateLink endpoint for `bedrock-runtime` | ❌ | ⬜ | ❌ |
| Token / cost alarms | ✅ four alarms → Slack | ⬜ | ✅ same four (copied) — both sets are `dimensions = {}`, so each fires on the other project's traffic in the shared account |

## The shape of it

- **Three CI-to-AWS models in one org**: OIDC federation with admin (barley), ambient CodeBuild roles nobody can read (hops, sowinsights, hops-mcp), and no CI at all (both GitLab IaC repos).
- **The controls exist somewhere**: barley has the KMS module, CloudTrail, GuardDuty, plan-in-PR and OIDC; hops has IRSA, ESO, internal ALBs and token alarms; hop-sowa-documents and the runner cache show the hops team knows how to build a bucket. None of it is shared — each repo re-derives its own subset.
- **Nothing scans infrastructure code** anywhere: Trivy's default ruleset found 530 + 49 + 97 + 31 + 18 + 17 FAILs on the first pass; the audit framework has no dimension that would have noticed.
- **The shared account is the blast radius**: hops, sow-insights and hops-mcp share 941000539201, one EKS cluster serves every HOPS environment, sow-insights peers into the corporate VPC, and the two projects' Bedrock alarms read the same account-wide metric.

## Platform layer (`core-infra`) and the live account — the cells that were "outside repo"

| Control | core-infra (code) | Account (Prowler, live) |
|---|---|---|
| CI identity | ⚠️ CodeBuild projects and role in code; no GitHub OIDC provider | 7 CodeBuild projects, buildspec not user-controlled ✅ |
| CI role least-privileged | ❌ one role for 7 repos, `system:masters`, `iam:PassRole` / `lambda:UpdateFunctionCode` / `ecr:PutImage` on `*`, webhook filter `WORKFLOW_JOB_QUEUED` only, `privileged_mode` | 4 customer policies allow privilege escalation (incl. `planner-compute-gitlab-runner`) |
| EKS API private / restricted | ❌ `endpoint_public_access = true`, `endpoint_private_access = false`, no CIDR list | ❌ private access disabled |
| EKS secrets KMS | ❌ `create_kms_key = false`, `encryption_config = null` | ❌ no encryption for Kubernetes secrets |
| EKS control-plane logging | ⚠️ never asserted (module default) | ⚠️ enabled, not all types |
| ESO store scope | ❌ `parameter/*`, `secret:*`, shared SA, unqualified trust | KMS key used by ESO: rotation disabled |
| CloudTrail | ❌ not in code — **and correctly so** | ✅ two **organization** trails from the IT-managed management account `060183668755`: multi-region, log-file validation on, KMS-encrypted. Plus one leftover *local* trail `management-events-test` without validation or KMS, which is what Prowler flagged |
| AWS Config | ❌ not in code — **and correctly so** | ✅ recorder deployed by an organization CloudFormation StackSet (`recordingGroup.allSupported = false`, a limited resource set — worth raising with IT) |
| GuardDuty / Security Hub / Access Analyzer | ❌ | ❌ all three off — no detector or hub in either region, not delegated from the organization. Owned by nobody |
| Root MFA | — | ⚠️ not enabled, but this is a **member** account: root holds no access keys and every human uses SSO. An item for the IT department (centralized root access management removes member-account root credentials outright), not for a project |
| VPC flow logs | ❌ | ❌ 4 VPCs without |
| Account-level S3 public-access block | — | ❌ not configured (all 26 buckets individually blocked ✅; 24 without TLS-only policy; 26 without access logging) |
| EBS default encryption | — | ❌ off; 50 unencrypted volumes/snapshots |
| ECR scan on push | ❌ (planner-ecr) | ❌ 35 of 36 repos |
| Bedrock invocation logging / guardrails | ❌ not in code | ✅ logging on; a guardrail exists (missing contextual grounding) — configured by hand |
| Detective / alerting | ⚠️ Alertmanager → Slack; budget module commented out | — |
