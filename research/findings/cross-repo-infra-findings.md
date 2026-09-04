# Cross-repo findings — cloud infrastructure security

Derived from `../baseline/cloud-cross-repo-matrix.md`, `../baseline/hops-infra-baseline.md`,
`../baseline/barley-infra-baseline.md` and the scanner artifacts in `../../artifacts/cloud/`. Each
finding names its proof; none is a recommendation yet — the roadmap is in
`hops-infra-gap-analysis.md`.

## F1 — Three CI-to-AWS trust models in one org, and the strongest one is the most dangerous

| Model | Where | What it means |
|---|---|---|
| OIDC federation, then `AdministratorAccess` | barley — `terraform/us-west-2/base-{dev,prod}/locals.tf`, resolved in `modules/github_oidc_provider/main.tf:206-208` | The right mechanism (short-lived, no stored keys, 16 workflows, zero static keys) carrying the wrong permission. Every workflow run is an account admin; the six scoped policies listed above it never bind |
| Ambient CodeBuild runner role | hops app (`runs-on: codebuild-hops-*`), sowinsights, hops-mcp; defined in **core-infra** | No stored credentials, and now readable: **one role, `codebuild-hops-aws-iac`, for all seven CodeBuild projects**, mapped `system:masters` on the production cluster, holding `iam:PassRole` + `ecs:RegisterTaskDefinition`/`UpdateService` on `*` (escalation to any role), `lambda:UpdateFunctionCode` on `*`, `ecr:PutImage` on `*`, the prod DB dump, and the org GitHub connection token; every project `privileged_mode = true`; the webhook's only filter is `WORKFLOW_JOB_QUEUED` — no actor, no branch. A merge in `sowinsights` or `hops-mcp` reaches account-admin-equivalent (`core-infra-baseline.md` P-1) |
| No CI — laptops with ambient credentials | all three GitHub IaC repos (`core-infra`, `hops-infra`, `sowinsights-infra`): no `.github/` directory, a GitLab MR template each, `sowinsights-infra` `Makefile` with `terraform apply -auto-approve`) | The GitHub migration was a file copy: the one automation that existed (hops's GitLab-variable pipeline) was deleted with nothing in its place. No plan review, no scanner, no attribution, no drift detection |

The capability story is not "adopt OIDC". It is: **federate, scope, and put the identity in code where it can be reviewed** — barley has step 1, nobody has steps 2 and 3.

## F2 — Nothing scans infrastructure code, anywhere

First-pass Trivy (default ruleset, `artifacts/cloud/trivy-misconfig-2026-09-03.md`):

| Repo | FAIL | CRITICAL | HIGH | Distinct checks |
|---|---|---|---|---|
| barley | 530 | 16 | 279 | 44 |
| hops app (Helm + Dockerfiles) | 97 | 0 | 23 | 22 |
| hops IaC (head) | 49 | 2 | 22 | 31 |
| hops-mcp (rendered) | 31 | 0 | 6 | 17 |
| sowinsights app | 18 | 0 | 5 | 17 |
| sow-insights-infra | 17 | 3 | 7 | 10 |

The only linter that runs in any pipeline is barley's tflint (style/correctness; 0 issues). The hops IaC
repo ships a `.tflint.hcl` that cannot load under any tflint since v0.54 — proof by incompatibility
that it has not run in years (`artifacts/cloud/tflint-2026-09-03.md`). Same finding shape as capability 1's
"one repo has the secret gate, three do not" — except here it is zero of six.

## F3 — The controls exist in the org; they are just never shared

| Control | Who has it right | Who lacks it |
|---|---|---|
| Customer-managed KMS with rotation and a CI plane split | barley `modules/kms` | hops IaC (zero `aws_kms_key`), sow-insights-infra |
| CloudTrail with log validation + GuardDuty + Slack runbook | barley prod | barley dev, hops, sow-insights (none in code) |
| Terraform plan as a PR comment, apply job, tflint gate | barley | both GitLab IaC repos |
| S3 bucket built right (versioning, SSE, full PAB, lifecycle) | hops IaC `hop-sowa-documents`, `gitlab-runners-cache` | hops IaC `hops-prod-db-dump`, `hops-insights`; barley `modules/s3/v2` (prod) |
| Bedrock invoke scoped to model ARNs | sow-insights-infra `modules/iam/iam.tf` | hops IaC (`Resource: "*"` ×3), barley (`bedrock:*` on `*`) |
| IRSA with fully-qualified subject | hops IaC dev/prod roles, `hops-fin-service` | hops IaC preview roles (`hops-preview-*` wildcard) |
| Non-root, multi-stage, health-checked image | hops `hop-agent`, hops-mcp | hops `hop-backend`, `hop-ui`; barley (30 root stages); sowinsights |
| Secrets Manager with `valueFrom` | barley | hops (SSM, fine — but `refreshInterval: "0"` in the IaC-managed ExternalSecrets, so rotation never lands) |
| Accepted-risk register | hops `docs/processes/security-notes.md` | everyone else |

Each repo re-derives its own subset from scratch. A shared module set (bucket, ECR repo, IRSA role, RDS
cluster) and a shared pipeline template would carry all of these at once — that is the "blueprint"
of this capability, the way the gitleaks config + CI job was for capability 1.

## F4 — The shared account is the blast radius

- `941000539201` hosts hops (EKS `internal-projects`), sow-insights (ECS, us-east-1) and hops-mcp.
- One EKS cluster serves HOPS prod, dev, demo and every PR preview; isolation is by namespace, with a
  NetworkPolicy only on prod `hop-be` and `secrets: get,list` + `pods/exec` for `system:developers` in
  preview namespaces.
- sow-insights peers its VPC into the shared corporate VPC and writes routes into **every** route table
  on both sides, then opens 80/443 on its service SG to `0.0.0.0/0` — reachable from the whole
  corporate network, not from the internet.
- Both projects' Bedrock token alarms are `dimensions = {}`: each fires on the other's traffic.
- sow-insights' Slack alerting `data`-references HOPS's `AWSChatbotRole-hops-chatbot` — a live
  cross-project IAM dependency nobody's plan shows.
- The hops IaC root reads the entire platform state (`internal.tfstate`), which typically holds other
  projects' outputs and secrets.

## F5 — Secrets never appear as literals, and still leak by design

No repo commits a credential value into Terraform (grep across all six). The leaks are structural:

| Vector | Evidence |
|---|---|
| CI variables pushed unmasked and unprotected — prod JWT signing secret, Google OAuth secret, HubSpot prod token, Bitwarden master credential — readable from any unprotected branch's pipeline and printed in any job log that echoes | hops IaC `modules/gitlab-vars/main.tf` (no `masked`), `locals.tf` (`protected_gitlab_vars = {}`, 35 keys) |
| `sensitive = true` never used → every SSM-sourced secret renders in `terraform plan` output | hops IaC: 0 occurrences |
| A GitHub *variable* used as a password, then posted into a PR comment inside a sign-in URL | hops `hops-main.yml:218`, `hops-preview.yml:411-420` |
| `ssm get-parameter --with-decryption` output not masked in the job | hops `hops-demo.yml:222-231` |
| DB password interpolated into the java command line | hops `hop-backend/Dockerfile` `ENTRYPOINT` |
| A well-known default credential live in a values file | hops IaC `modules/jaeger/templates/values.yaml:133` (`changeme`, ES on plain HTTP) |
| Production DB password in an agent allow-pattern (capability 1, still open ~13 weeks) | barley audit 2026-06-03 `security.md:31-37` |

Capability 1's secret gate scans **committed values**. None of these is a committed value. The
infrastructure-side control is different: masking and protection flags, `sensitive` marks, and
never building a password into a command line or a URL.

## F6 — Production data leaves production

`hops-demo.yml:193` restores `s3://hops-prod-db-dump/hops-prod-dump.sql` into demo namespaces on spot
nodes; `docs/processes/development.md:125` says previews carry no production data. The dump itself is
written by a `0777` script that `apt install`s from the internet nightly with no `set -e`, into a
bucket with no declared SSE, no public-access block and no TLS-only policy (`modules/hops-prod/main.tf`).
`Planner_Developers` — a human IAM role — holds Get/Put/**Delete**/List on the prod SOW documents bucket
(`modules/hop-sowa-documents/main.tf`, `main.tf:280`).

## F7 — Kubernetes hardening is absent as a class, not as an oversight

Zero `securityContext` across hops's five charts, sowinsights's chart and hops-mcp's chart (`grep` →
0 in each; Trivy KSV-0001/0003/0004/0012/0014/0030 on every deployment). `hop-backend` and `hop-ui`
images run as root, so the pods run as uid 0 with a writable root filesystem. No chart has a
`values.yaml` in hops (everything is `--set` from CI), no chart is linted, no manifest is scanned.
The one non-root image (`hop-agent`) and the hardened Dockerfile in hops-mcp show the team knows the
pattern — it never became a chart default or a policy (no Pod Security Admission labels, no
admission controller).

## F9 — The platform is the least-covered repo, and it decides everyone's score

`core-infra` coverage 24 % (`../baseline/cloud-control-scores.md`): EKS API public to the internet with private
access disabled and no secrets encryption; External Secrets able to read every parameter and secret in the account
from any namespace; two legacy GitLab runners still deployed as `cluster-admin` with privileged pods; `Planner_Developers`
trusting the whole account root; `ingress-nginx` 4.1.4 from 2022 on the internet-facing NLB; six committed credentials
(a Bamboo password, staging and production Google OAuth client secrets) in a dead module. Every app repo's "ambient
role" and "cluster is platform-level" cell resolves here.

## F10 — The live account confirms the code, and adds what the code never knew

Prowler (`../../artifacts/cloud/prowler-2026-09-04.md`): 72.5 % pass-rate, CIS 5.0 67.5 %, Well-Architected security
72.3 %. Reading it required one piece of context the code does not carry: `941000539201` is a **member** account of the
organization `060183668755`, run by the IT department, and every human reaches it through SSO with role assumption.

**Provided centrally, and done well** — CloudTrail as two organization trails (multi-region, log-file validation,
KMS-encrypted) and AWS Config from an organization StackSet. Their absence from every project repository is correct,
not a gap; scoring a project down for not re-declaring an org-managed trail would have been wrong, and the first draft
of this research did exactly that.

**Switched on locally by hand, declared nowhere** — Bedrock invocation logging and one guardrail.

**Owned by nobody** — GuardDuty, Security Hub, IAM Access Analyzer, VPC flow logs on all four networks, the
account-level S3 public-access block, EBS default encryption, the password policy. IT has not pushed them down; no
project has asked. This is the real detective gap, and it is smaller and sharper than "no detective controls".

**Local litter** — a non-organization trail `management-events-test`, still logging without validation or KMS,
duplicating the organization trails; two IAM users (from 2018 and 2024) holding static keys, one unrotated for 673 days.

And the shared-account picture in one table: all 14 critical findings belong to other projects in the account (SSH open
to the internet on two instances, Slack and Notion tokens in Lambda environment variables, secrets in ECS task
definitions), plus the organization's SSO administrator policy and the member account's root user — none is a HOPS
resource, all of them share HOPS's blast radius.

## F8 — The audit that drives remediation cannot see any of this

See `awos-infra-coverage.md`: no infrastructure dimension exists; the only infra-adjacent verdicts
are AS-01 (accepted risk, permanent FAIL) and AS-14 (a SKIP that is a false negative here).
`collected/ci.json` is `available: false` — the audit has never seen a pipeline run.

## What transfers beyond these repos

- **A pipeline for IaC** with plan-in-PR, a misconfiguration scanner and a federated, scoped, in-code
  CI identity — barley's structure with hops's discipline on `Resource`.
- **Shared, hardened modules** for the five resources every project creates (bucket, ECR repo, IRSA
  role, database, ingress) so the good copy propagates instead of the bad one.
- **Secret-handling flags as a checklist**, not a scanner: `masked`, `protected`, `sensitive`,
  `valueFrom`, never in argv, never in a URL.
- **An infrastructure dimension for the audit**, derived from the same six control groups, so the
  fail → fix → pass loop that worked for capability 1 has something to measure here.
