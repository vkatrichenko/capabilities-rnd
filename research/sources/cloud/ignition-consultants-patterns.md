# ignition-consultants — patterns adopted into the capability-2 task list

Source: `proj-ignition-consultants/ignition-consultant-ai` (GitLab), branch `dev`, HEAD **991571668**
(2026-06-17), production account directory `terraform/874962954956` — the README and `locals.tf`
(`environment = "prod"`) identify it as prod despite the branch name. Reviewed read-only 2026-09-04;
nothing modified, no `terraform` or `aws` command run against it.

**Scope of this file.** A full security review of that project was carried out and delivered to
Vladyslav in conversation. It is deliberately **not** reproduced here: another project's findings are
not this capability's output, and the request was explicit. What this file records is the four
patterns that HOPS should adopt, with the paths they were read from, so the citations in the report's
task list trace to something. One structural observation about a *shared* template is kept, because it
is a fact about HOPS's own code.

## The four patterns

### 1 · A single named file per account for detective controls → task T6

`terraform/874962954956/security_audit.tf`, 105 lines, holds every detective control in that account:
a CloudTrail module, an AWS Config recorder, a Security Hub module, a GuardDuty module, and a
scheduled IAM-hygiene Lambda.

Why it is worth copying: "what is watching this account?" becomes a question answered by opening one
file, and the same file diffs cleanly between environments. In that project the diff is what reveals
that its production account is missing Config rules its development account has — a gap invisible in a
repository that scatters these resources across `main.tf`, `logging.tf` and `monitoring.tf`. Pure
convention, zero cost, and HOPS currently has no file that answers the question at all.

### 2 · Security Hub findings, severity-filtered, into Slack → task T6

`terraform/modules/security_hub/main.tf`: `aws_securityhub_account`, a standards subscription to
`aws-foundational-security-best-practices/v/1.0.0`, and an `aws_cloudwatch_event_rule` whose pattern
filters to `Severity.Label ∈ {CRITICAL, HIGH}` **and** `Compliance.Status ∈ {FAILED, WARNING}` before
targeting an SNS topic.

Why: enabling Security Hub is the easy half and produces a console nobody opens. The filter is what
keeps a Slack channel signal rather than noise, and it is roughly thirty lines. HOPS already has the
SNS-to-Chatbot path and the read-only guardrail on the Chatbot role, so only the middle piece is new.

### 3 · Terraform pre-commit hooks, with the scanner warn-only at first → tasks T-H2 and T-I5

`.pre-commit-config.yaml` at the repository root:

- `antonbabenko/pre-commit-terraform` v1.105.0
- `terraform_fmt` (recursive, with diff), `terraform_docs` (writes into `README.md`),
  `terraform_tflint`, and `terraform_trivy`
- the scanner is deliberately non-blocking to begin with:
  `--args=--severity HIGH,CRITICAL` and `--args=--exit-code=0   # warn-only at first`

`.tflint.hcl` at the same level is current and loads: `required_version >= 0.54`,
`call_module_type = "all"`, AWS ruleset 0.36.0, `recommended` terraform preset, with
`terraform_comment_syntax`, `terraform_naming_convention` and `terraform_unused_required_providers`
enabled.

Why: this is the exact ratchet shape proposed independently in T-H2 and T-I5 — start warn-only against
a baseline, tighten later — already running in a Provectus repository, so it is a copy rather than an
experiment. And their `.tflint.hcl` is the direct replacement for `hops-infra`'s, which no tflint
released since 2024 can parse (`../../../artifacts/cloud/tflint-2026-09-03.md`).

Honest limit: their Trivy in *CI* is `trivy image` only. The infrastructure scan lives in pre-commit,
which is developer-side and skippable. HOPS should run it in the pipeline as well, which is what T-H2
and T-I5 specify.

### 4 · Backups enrolled by tag → task T-I7 (new)

`terraform/874962954956/backup_plans.tf` declares two plans through `terraform/modules/backup_plan`:
`weekly-backup` (Sunday, 60-day retention) and `three-month-backup` (quarterly, 365-day). The module
creates one vault, one plan and one `aws_backup_selection` whose `selection_tag` matches
`BackupPlan = <plan_name>`. Resources opt in by carrying that tag.

Why: it replaces one backup module per resource with two plans plus a tag, so a new resource is
enrolled by adding a tag rather than by remembering to edit a plan. "Is this backed up?" becomes a tag
query. The file also carries a good migration comment explaining that the old per-table module is kept
until the new plans have produced their first recovery points.

**What to add that their version lacks** — verified absent there by grep, and specified in T-I7:
`aws_backup_vault_lock_configuration`, `copy_action` to a second region or account,
`cold_storage_after` on the long plan, and a customer-managed key on the vault. Without the lock and
the copy, one compromised administrator removes the backups and the data together. Their RDS clusters
are also not enrolled — only DynamoDB is — so HOPS should enrol the Aurora cluster and the document
buckets from the start.

HOPS has none of this: no AWS Backup plan, vault or selection in any repository, and the only
production data protection is Aurora's seven-day retention plus the nightly `pg_dump` described in
T-H4.

## The one finding kept: this is a shared template, and the flaw travels with it

Comparing the two projects' GitLab-runner IAM roles —
`terraform/modules/gitlab/helm_runner/locals.tf` there, and
`core-infra/terraform/us-east-2/modules/gitlab/helm-runner/main.tf` in HOPS — the action sets are
**33 each, 30 identical**, differing only by `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` and
`s3:DeleteObject` on the HOPS side and `ecs:DescribeServices`, `s3:AbortMultipartUpload` and
`s3:GetBucketLocation` on theirs. Both grant `iam:PassRole` on `*` alongside
`ecs:RegisterTaskDefinition` and `ecs:UpdateService`, plus `lambda:UpdateFunctionCode` and
`ecr:PutImage` on `*`. Both projects' EKS node roles carry the identical six AWS-managed `FullAccess`
policies.

So the privilege-escalation shape at the centre of **T3** is not a HOPS mistake — it is an internal
DevOps template propagating by copy between projects. That is the strongest available argument for
**T-C1** (shared, versioned modules): a template that spreads a flaw this efficiently will spread the
fix just as efficiently, and fixing it in one place is worth more than fixing it in each project.
