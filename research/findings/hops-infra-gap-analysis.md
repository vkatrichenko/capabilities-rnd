# HOPS — infrastructure gap analysis and the task list

Skeleton from capability 1: read the metric correctly → what is open → what moved → blind spots → what
Phase 2 takes → what it proves. Baselines: `../baseline/core-infra-baseline.md`,
`../baseline/hops-infra-baseline.md`, `../baseline/cloud-control-scores.md`; live account:
`../../artifacts/cloud/prowler-2026-09-04.md`.

## Read the metric correctly

Three numbers, three meanings. **Control coverage** (awarded ÷ applicable over the same 23-control list,
AWOS-style) is judged against what the standards ask — core-infra 29 %, hops-infra 33 %, hops app 35 %,
barley 36 %, sowinsights-infra 41 %. (Revised 2026-09-04 after establishing the account context: human access
is SSO with role assumption, and CloudTrail and AWS Config come from the IT-managed organization — two controls
scored as absent in the first pass are in fact partly satisfied.) **Trivy pass-rate** is what the scanner checks, weighted by how many
resources exist — 87–95 % for most repos, 68 % for barley — high because most resources are fine and the
scanner cannot see identity or process. **Prowler pass-rate** is the live account — 72.5 %, CIS 5.0 67.5 %.
None of the three is "how secure"; together they say where the gap is: not in the resources, in the
seams between them.

## What is open — as tasks

Each task: what is wrong (evidence), why it must be fixed (what it lets happen), what "done" is, effort,
owner. Order inside each block is impact ÷ effort. Scope: **T-H items land in `hops` under the approved
scope (dev first)**; platform and IaC items are recommendations to their owners until confirmed.

### Block A — stop the bleeding (days)

*T1 is listed first because a scanner flags it loudest; it is the one item in this block that belongs to
the IT department rather than to us. T2–T4 are ours.*

**T1 · Ask IT to close out the member account's root user** · owner: **IT department** · effort: one email
- Wrong: `iam_root_mfa_enabled` FAIL. Context established afterwards: `941000539201` is a **member** account
  of the organization `060183668755` (all features enabled), root holds no access keys, and every human signs
  in through AWS SSO with role assumption. This is not a project task, and root is nobody's daily login.
- Why: root still bypasses every policy in this report if it is ever used, and only the organization's owner
  can settle it.
- Done when: IT confirms either a hardware second factor on the member account's root user, or — better —
  centralized root access management, which removes member-account root credentials outright.
- Note: this item moved out of "act this week" once the account's ownership was checked. It is listed because
  Prowler flags it, not because the project can fix it.

**T2 · Rotate the committed credentials and delete the dead module** · owner: core-infra · effort: hours
- Wrong: six `base64encode("…")` literals in `core-infra/terraform/us-east-2/modules/parameter-store/locals.tf` — a Bamboo service-account password, staging and **production** Google OAuth client secrets, a staging Postgres password. Module uncalled; values in every clone's history.
- Why: `base64encode` is encoding, not encryption; anyone with repo read has the production OAuth client secret.
- Done when: all six rotated at the issuer, the module directory deleted, the rotation recorded in the accepted-risk register (history rewrite is optional and does not revoke).

**T3 · Split the CodeBuild role** · owner: core-infra · effort: MEDIUM
- Wrong: `codebuild-hops-aws-iac` is the service role of all 7 projects, `system:masters` in aws-auth, `iam:PassRole` + `ecs:RegisterTaskDefinition` + `ecs:UpdateService` on `*`, `lambda:UpdateFunctionCode` on `*`, `ecr:PutImage` on `*`, `s3:GetObject` on the prod dump, the CodeConnections token; `privileged_mode = true`; webhook filter `WORKFLOW_JOB_QUEUED` only; trust without `aws:SourceArn`.
- Why: a merged (or, without the org's fork-approval setting, a forked) PR in `sowinsights` or `hops-mcp` is an account administrator and a cluster admin — the single largest privilege in the org sits behind a filter that checks nothing.
- Done when: one role per project with only its ECR repo, its namespaces (RBAC, not `system:masters`), its SSM path; `iam:PassRole` limited to the task roles it deploys; `lambda:UpdateFunctionCode` and `ecr:PutImage` scoped or removed; webhook filters on `ACTOR_ACCOUNT_ID` and `HEAD_REF`; `aws:SourceArn` in the trust; `privileged_mode` only where docker-build needs it.

**T4 · Close the EKS API and encrypt its secrets** · owner: core-infra · effort: LOW–MEDIUM
- Wrong: `endpoint_public_access = true`, `endpoint_private_access = false`, no CIDR allowlist (`0.0.0.0/0`); `create_kms_key = false`, `encryption_config = null`; log types never asserted (Prowler: not all types).
- Why: the production cluster's API is reachable from anywhere; a leaked token is a shell; secrets in etcd are AWS-default encrypted only.
- Done when: private access on, public access restricted to the VPN/office CIDRs (or off), a CMK in `encryption_config`, all five log types set in code; Prowler `eks_*` checks PASS.

### Block B — the platform (core-infra owners)

**T5 · Scope External Secrets** · effort: MEDIUM
- Wrong: the ESO IRSA role reads `ssm:…:parameter/*` and `secretsmanager:…:secret:*`; both `ClusterSecretStore`s share one service account; trust has no `oidc_fully_qualified_subjects`.
- Why: any namespace that can create an `ExternalSecret` (the CodeBuild role, the GitLab runners) reads every project's secrets — HOPS prod DB, planner, sow-*, the platform's own tokens.
- Done when: per-namespace `SecretStore`s backed by roles scoped to that project's SSM path, fully-qualified trust with `:aud`; the cluster stores removed.

**T6 · Close the detective gap — after asking IT what they already push down** · effort: LOW–MEDIUM · owner: core-infra + IT
- **Already handled centrally** (verified live 2026-09-04, do not rebuild): CloudTrail as two *organization*
  trails from the management account — multi-region, log-file validation on, KMS-encrypted — and AWS Config from
  an organization CloudFormation StackSet. Their absence from the project repos is correct, not a gap.
- **Genuinely off, owned by nobody**: GuardDuty and Security Hub (no detector or hub in either region, not
  delegated), IAM Access Analyzer, VPC flow logs on all four networks, the account-level S3 public-access block,
  EBS default encryption, the password policy.
- **Local litter**: a non-organization trail `management-events-test` still logging without validation or KMS
  into a bucket in this account — the trail Prowler actually flagged.
- Why: nothing today would detect the misuse of the shared pipeline role in T3. The central trail records the
  API call, but no service is watching it and there is no network record to corroborate it.
- Done when: (1) IT has answered whether GuardDuty and Security Hub will be delegated organization-wide — a
- **Adopt the shape ignition-consultants already runs** (`../sources/cloud/ignition-consultants-patterns.md`,
  patterns 1 and 2): a single file named `security_audit.tf` per account holding CloudTrail, Config, GuardDuty
  and Security Hub together, so "what is watching this account?" is answered by opening one file and diffs
  cleanly between environments; and Security Hub subscribed to the Foundational Security Best Practices
  standard with an EventBridge rule filtered to `Severity.Label ∈ {CRITICAL, HIGH}` and `Compliance.Status ∈
  {FAILED, WARNING}` routed to the existing Slack SNS topic. HOPS already has the SNS-to-Chatbot path and the
  read-only Chatbot guardrail, so only the subscription and the filter are new.
  module that later collides with an org roll-out is the wrong outcome; (2) the account-level settings this
  account does own are declared in `core-infra` (barley's `modules/guardduty` is the template); (3) the leftover
  test trail is deleted. Prowler ACCT.11/.14/.15 PASS and no duplicate trail.
- Raise with IT in the same conversation: the Config recorder runs with `allSupported = false`, a limited
  resource set.

**T7 · Retire the legacy GitLab runners and fix the developer role** · effort: MEDIUM
- Wrong: two runner service accounts bound to `cluster-admin`, `privileged = true` with a rw `/sys/fs/cgroup` hostPath, IRSA roles with `ssm:GetParameter` on `*` and the same `PassRole`/`PutImage`/`UpdateFunctionCode` wildcards; `Planner_Developers` trusts `Principal.AWS = 941000539201` with `Condition: {}` and carries `lambda:*`, `events:*`, `ssm:PutParameter` on `/config/hop-project/*`, `secretsmanager:DeleteSecret` on `sow-*`; Prowler flags `planner-compute-gitlab-runner` for privilege escalation.
- Why: GitLab is retired — these are unused root-equivalent paths into the cluster and the account; the developer role is assumable by every principal in the account.
- Done when: both runner modules removed from `modules.tf` and the releases uninstalled; `Planner_Developers` trust narrowed to the SSO permission set with an MFA condition; `lambda:*`/`events:*`/`PutParameter`/`DeleteSecret` replaced by enumerated actions.

**T8 · Upgrade the edge and the platform add-ons** · effort: HIGH
- Wrong: `ingress-nginx` chart 4.1.4 (2022) on the internet-facing NLB; `kubernetes-dashboard` dead module with `--enable-skip-login` + cluster-admin; Grafana public with `allow_sign_up: true` and a local admin login that bypasses SSO (seed `changeme`); Prometheus/Alertmanager plain HTTP without auth on the internal NLB.
- Why: three years of ingress-controller CVEs on the public edge; a shared admin password on a public URL.
- Done when: ingress-nginx current, dashboard module deleted, Grafana `disable_login_form` + no sign-up, Prometheus/Alertmanager behind oauth2-proxy.

### Block C — HOPS, within the approved scope (`hops` dev first)

**T-H1 · Pod security context as the chart default** · effort: LOW
- Wrong: zero `securityContext` in five charts; `hop-backend` and `hop-ui` images have no `USER`; no `values.yaml` to carry a default (Trivy 97 FAIL as charts).
- Why: every HOPS pod runs as uid 0 with a writable root filesystem — a container escape starts from root.
- Done when: `runAsNonRoot`, `readOnlyRootFilesystem` (+ the `emptyDir`s the apps need), `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, seccomp `RuntimeDefault` in a `values.yaml` per chart; `USER` in both Dockerfiles; proved on dev with a planted root container that fails the new check.

**T-H2 · Misconfiguration scan in the MR pipeline** · effort: LOW
- Wrong: no scanner reads `helm/`, the Dockerfiles or `.github/`; zero required status checks on `main`.
- Why: T-H1 regresses the day someone adds a chart without it; the audit has no dimension to notice.
- Done when: an unconditional `trivy config` job (binary SHA256-verified like gitleaks) over `helm/`, Dockerfiles and workflows, WARN against a committed baseline that ratchets, **failing when nothing was scanned**; listed as a required check once the admin enables it.
- The warn-first ratchet is not an experiment: ignition-consultants runs `terraform_trivy` at
  `--severity HIGH,CRITICAL` with `--exit-code=0` and the comment "warn-only at first"
  (`../sources/cloud/ignition-consultants-patterns.md`, pattern 3).

**T-H3 · Pin the installers, scope the token, check the commenter, make the password a secret** · effort: LOW
- Wrong: `curl … helm/helm/main … | bash` and Grype's installer on every deploy job; no `permissions:` on prod/dev/demo deploy jobs; `/deploy-admin`, `/destroy-admin`, stop-* triggered by any commenter; `USER_PASSWORD` is a GitHub *variable* reaching prod as an env var, and the preview password is posted into a PR comment inside a sign-in URL.
- Why: the runner that deploys prod executes unpinned code from a mutable branch; a comment tears down environments; the password sits in logs, history and Referer headers.
- Done when: helm and Grype by version + checksum; top-level `permissions: contents: read`; `author_association` in MEMBER/OWNER on the four comment triggers; `USER_PASSWORD` moved to a secret and the preview password delivered out of band.

**T-H4 · No production data outside production** · effort: MEDIUM (with hops-infra)
- Wrong: `hops-demo.yml:193` restores `s3://hops-prod-db-dump/hops-prod-dump.sql` into demo namespaces on spot nodes; the process doc says previews carry no production data; the dump itself is written by a `0777` script with nightly `apt install` and no `set -e`, into a bucket with no declared SSE/PAB/TLS policy (Prowler: no TLS-only policy, no access logging).
- Why: the production database is copied to the least-protected environment every demo, and the copy job can silently overwrite the last good dump with an empty file.
- Done when: demo seeded from a sanitised dataset; the dump job `set -euo pipefail`, awscli baked into the image, mode `0555`; bucket SSE + PAB + `aws:SecureTransport` deny declared in `hops-infra`.

### Block D — hops-infra (owners; every item a one-line to one-file change)

**T-I1 · ECR: scan on push, immutable tags, no `:latest` to prod** · effort: ONE LINE ×2 + one workflow line
- Wrong: `scan_on_push = false`, `MUTABLE` on eight repos (Prowler: 35 of 36 in the account); `hops-main.yml` pushes `:latest` alongside the sha tag.
- Why: a vulnerable image is never flagged; a tag can be repointed after review.
- Done when: `scan_on_push = true`, `IMMUTABLE`, the `:latest` push removed; Prowler `ecr_repositories_scan_images_on_push_enabled` PASS for the eight.

**T-I2 · Aurora: enforce TLS, protect from deletion** · effort: LOW
- Wrong: no `aws_rds_cluster_parameter_group` (so `rds.force_ssl = 0`), no `deletion_protection` (Prowler: `hops-db` and `hops-fin-service` FAIL), no CMK, single instance.
- Why: plaintext client connections are accepted today; a destroy or a replacing diff drops production.
- Done when: a parameter group with `rds.force_ssl = 1`, `deletion_protection = true`, `publicly_accessible = false` asserted; the two Prowler rows PASS.

**T-I3 · Take Jaeger off the public zone; remove the literal passwords** · effort: LOW
- Wrong: Jaeger UI on `jaeger.hops.provectus.pro` behind HTTP basic auth (the public nginx from core-infra serves it); Elasticsearch `password: changeme` on plain HTTP; SonarQube `monitoring_passcode = "adminpassword"`; ESO `refreshInterval: "0"` at six sites.
- Why: traces expose paths, user ids and queries to the internet behind one password; two well-known defaults are live; a rotated secret never reaches the cluster.
- Done when: Jaeger on the internal domain with `scheme: internal`; both passwords from SSM; `refreshInterval` set.

**T-I4 · Scope the IRSA policies and the human grant** · effort: MEDIUM
- Wrong: `bedrock:InvokeModel` on `Resource: "*"` (3 roles); `s3:*` on `hops-insights`; preview roles trusting `hops-preview-*` and `hops-sowa-preview-*` without `:aud`; `Planner_Developers` Get/Put/**Delete**/List on the prod documents bucket.
- Why: `s3:*` includes deleting the bucket and its public-access block; any namespace with the prefix mints the role; a developer can delete production documents.
- Done when: a model-ARN list (sowinsights-infra already has one), enumerated S3 actions, `:aud` on the wildcard trust, `DeleteObject` removed for the human role.

**T-I5 · A pipeline for every IaC repo** · effort: MEDIUM (template once, three repos)
- Wrong: `core-infra`, `hops-infra`, `sowinsights-infra` have no `.github/` at all; applies run from laptops; hops-infra's `.tflint.hcl` cannot load under any tflint since 2024; `sowinsights-infra` applies with `-auto-approve`.
- Why: nothing reviews a plan, scans a change, or records who applied what; T-I1–T-I4 regress silently.
- Done when: one reusable workflow — fmt + validate + tflint + `trivy config` on PR, plan as a PR comment (barley's shape), manual apply on `main` — with a per-repo OIDC role scoped to its state key; the repo's own README updated from GitLab to GitHub.
- Take the developer-side half near-verbatim from ignition-consultants: their `.pre-commit-config.yaml`
  (`antonbabenko/pre-commit-terraform` with `terraform_fmt`, `terraform_docs`, `terraform_tflint`,
  `terraform_trivy`) and their `.tflint.hcl`, which is current and actually loads — the direct replacement for
  `hops-infra`'s, which no tflint since 2024 can parse. Note their infrastructure scan runs only in pre-commit,
  which is skippable; ours must run in the pipeline as well.

**T-I7 · Real backups, enrolled by tag** · effort: MEDIUM · owner: hops-infra
- Wrong: no AWS Backup plan, vault or selection exists in any HOPS repository. The only protections are Aurora's
  `backup_retention_period = 7` and the nightly `pg_dump` — written by a `0777` script with no `set -e`, to a fixed
  object key each run overwrites, into a bucket declaring no SSE, no public-access block and no TLS-only policy
  (T-H4). Nothing covers the document buckets.
- Why: seven days of automated snapshots is not a recovery plan, and a dump job that can silently overwrite the last
  good copy with an empty file is worse than no dump job. Neither survives an account-level mistake or a rogue
  credential.
- Done when: the tag-based pattern from ignition-consultants is in place
  (`../sources/cloud/ignition-consultants-patterns.md`, pattern 4) — two or three `aws_backup_plan` resources each
  with a vault, and an `aws_backup_selection` keyed on a `BackupPlan` tag so a new resource enrols by adding one tag;
  the Aurora cluster and the document buckets enrolled, which their version does not do; and the four things their
  version lacks added before ours ships — `aws_backup_vault_lock_configuration`, a `copy_action` to a second region
  or account, `cold_storage_after` on the long plan, and a customer-managed key on the vault. Without the lock and
  the copy, one compromised administrator deletes the backups and the data in the same afternoon.

**T-I6 · Upgrade the toolchain** · effort: HIGH
- Wrong: TF 1.3.9 / aws 4.63.0 (2023) — predate Bedrock resources, ESO v1 and `use_lockfile`; ALB controller 1.5.2 with the unconditioned `ec2:AuthorizeSecurityGroupIngress` on `*`; the `gitlab` provider still required by a dead module.
- Why: no security fix in three years of provider releases has reached this repo; the controller can open ingress on any security group.
- Done when: staged upgrade with a plan diff per module, controller ≥ 2.7 with the current policy, dead modules deleted — after T-I5 so it is reviewed.

### Block E — recommendations to other owners

**T-S1 · sowinsights-infra: close the SG and scope the peering** · effort: LOW–MEDIUM — `0.0.0.0/0` on 80/443 (Prowler flags the SG) reachable through peering routes written into every route table of the shared corporate VPC; `-auto-approve` from a Makefile; ECR defaults; `:latest`.
**T-B1 · barley: drop `AdministratorAccess` from the OIDC role and encrypt the RDS module** — the org's best CI identity carrying the worst permission; `modules/rds` without `storage_encrypted`; `modules/s3/v2` without PAB/SSE; add a security scanner beside tflint.
**T-A1 · account owners: the 14 criticals** — SSH open to the internet on two instances, Slack/Notion tokens in Lambda environment variables, secrets in ECS task definitions (`malt`, `avatar-demo`): not HOPS resources, same blast radius.

### Block F — the capability deliverables (Phase 2)

**T-C1 · Shared modules** for bucket, ECR repository, IRSA role, RDS cluster and pipeline identity — the good
copies already exist (`hop-sowa-documents`, barley `modules/kms`, sowinsights-infra's Bedrock ARN list,
`hops-fin-service`'s trust) — so the good copy becomes the only copy. **The strongest evidence for this item is
that the flaw already propagates the same way**: the GitLab-runner role in `core-infra` and the one in
ignition-consultants share 30 of 33 IAM actions, including `iam:PassRole` on `*`, and both projects' EKS node roles
carry the identical six `FullAccess` policies (`../sources/cloud/ignition-consultants-patterns.md`). T3 is fixing a
template, not a repository — and a template that spreads a flaw that efficiently will spread the fix just as
efficiently.
**T-C2 · An `infrastructure-security` audit dimension** (`awos-infra-coverage.md`, twelve checks) so the fail → fix → pass loop has something to measure; file AS-14 upstream.
**T-C3 · The secret-handling checklist** — flags no scanner checks: `masked`, `protected`, `sensitive`, `valueFrom`, never argv, never a URL, never a variable.

## What moved — 2025-07 → 2026-07 in hops-infra

42 commits on GitHub after the retired GitLab head. Better: provider-level `default_tags` (the `staging`-on-prod
tag is gone), two buckets built right, an S3 endpoint, ESO v1, SonarQube on SSO, a fully-qualified fin-service
role. Worse: `s3:*` on a bare bucket, cross-account S3 RW, a human role with delete on prod data, a wider wildcard
trust, three more unscanned ECR repos, a second literal password, and the CI-variable pipeline deleted with nothing
in its place. **Every 2025 finding on RDS, ECR, Jaeger, the dump job and the toolchain is still present.** Without
a scanner in the loop the good and the bad land at the same rate.

## Blind spots — the audit and the scanners

- The AWOS audit has no infrastructure dimension; AS-14 skips exactly the repos that need it (`awos-infra-coverage.md`).
- Trivy silently reported 0 on hops-mcp's chart because it could not render it; rendered, 31 FAIL. A scanner in CI
  must fail on "nothing scanned".
- hops-infra's own `.tflint.hcl` is unloadable — a configured linter that cannot run reads as a pass in any
  file-existence check.
- The GitLab clone the first draft measured was 34 commits behind a repo that had moved hosts; the README pointer
  was the only thing consulted. `gh repo list` before the first read, always.

## What it proves for the capability

The org already contains every control the baseline asks for — in one repository each — and the platform that all
of them stand on is the least-covered piece. The gap is **propagation and enforcement**: no shared modules, no
scanner in any pipeline, no pipeline for any IaC repo, no audit dimension, and one CI identity for seven projects.
Same shape as capability 1, one layer down — which is what makes it a capability rather than a list of fixes.
