# What the AWOS audit sees of infrastructure — nothing, by design

Sources: `hops/context/audits/2026-08-03_19-15-15/*.json` and `2026-07-17_14-00-48/*.json`;
`barley/context/audits/2026-06-03/security.md`; the audit engine at plugin `awos` 2.4.4
(`~/.claude/plugins/cache/awos-marketplace/awos/2.4.4/skills/ai-readiness-audit/`), the same
version capability 1 filed #190–#192 against. Read with the capability-1 rule: `SKIP` means not
measured, `FAIL` means measured and absent, and only the second is closeable.

## 1. No infrastructure dimension exists

Thirteen dimension JSONs per run. A grep across all of them (both runs) for `terraform`, `iac`,
`checkov`, `oidc`, `sbom`, `encryption`, `eks`, `ecr`, `k8s`, `iam` (as a term) returns **zero
checks**. The security coverage is four dimensions — application (ASVS), supply chain, AI security
(agent files), prevention coverage — none of which reads a `.tf`, a Helm template, an IAM policy or
a workflow's `runs-on`. `standards.toml` in the engine has no category for infrastructure.

Consequence: the 07-17 → 08-03 remediation loop that capability 1 documented cannot happen for any
finding in this research, because nothing produces a FAIL to close. The hops IaC repo has never
been audited at all (it is a different repo from the one the audit runs on).

## 2. The only infra-adjacent verdicts

| Check | 07-17 | 08-03 | What it actually measures |
|---|---|---|---|
| AS-01 "application enforces TLS" | FAIL 0/8 | FAIL 0/8 | 13 plain-HTTP URLs in workflow `--set` values (`postgresAdminUrl`, `otelCollectorEndpoint`, `sowaApiUrl`). Documented accepted risk (`docs/processes/security-notes.md`): cluster-internal, TLS at the ALB. A permanent FAIL with no waiver — capability 1 already filed the waiver gap under the maintainers' #158 |
| AS-14 "sensitive file types excluded from VCS **and** from container image builds" | SKIP | SKIP | see §3 — a false negative in this repo |
| SCS-06 "CI includes dependency vulnerability scanning" | PASS | PASS | Grype on images + Dependabot. Correct, and it is the closest the audit gets to a container control |
| PRV-02 | PASS | PASS | the definition lists `trivy, grype, osv-scanner` as accepted scanners — the only occurrence of "trivy" in the audit is this list |
| `collected/ci.json` | `available: false` | `available: false` | "GitHub Actions config detected but no run history" — every CI conclusion is static file inspection; no evidence any gate ran |

## 3. AS-14 — verified by hand, then traced in the engine

**By hand.** hops root `.dockerignore` is seven lines (`.env`, `Dockerfile`, `.dockerignore`,
`README.md`, `.git`, `**/node_modules`, `**/dist`). `.gitignore` covers `*.pem`, `*.key`, `*.jks`,
`*.p12`, `*.pfx`, `credentials*.json`, `secrets*.{json,yaml,yml}`, `.auth/`, `.claude/settings.local.json`.
None of those appear in the root `.dockerignore`; `hop-backend` and `hop-agent` have no `.dockerignore`
of their own, and all three images build with the repo root as context (`hops-main.yml:151,170,189`:
`docker build -f ./<module>/Dockerfile … .`). A developer's local `.pem` or `credentials.json` — which
git correctly refuses — is copied into the image build context. That is precisely the inconsistency AS-14
is defined to flag ("inconsistency that would leak a secret into an image is flagged").

**In the engine** (`detectors/security.ts`, `detectSensitiveFilesGitignored`):

```ts
const relevantTypes = SENSITIVE_PATTERNS.filter(
  (p) => iterFilesIgnoreInsensitive(repoPath, [p.fileGlob]).length > 0
);
if (relevantTypes.length === 0) {
  // Nothing sensitive exists to cover — absence is not evidence of guardrails.
  return makeResult('SKIP', null,
    ['no sensitive file types present in this stack — ignore-coverage check not applicable'], 'detected');
}
```

Applicability is decided by whether a `*.pem` / `credentials*.json` / … **currently exists in the
working tree**. A repo whose developers have never left one lying around is skipped; a repo with an
uncovered one FAILs. The check therefore only ever runs on repos that already have the problem on
disk, and reports "not applicable" on the ones where the ignore-file inconsistency is a latent leak.
The `git_ignore.ts` comment shows the maintainers already fixed the *opposite* trap (an
ignore-honoring walk made PASS unreachable) — the remaining gap is the same shape one step earlier.

**What the check should do**: evaluate coverage on the *pattern set*, not on file presence — compare
what `.gitignore` treats as sensitive with what every `.dockerignore` in a build context covers, and
FAIL on the difference when a `Dockerfile` exists. That is a 15-line change and a test fixture with an
empty tree. Same reporting shape as #190–#192: file, line, reproducer, fix, test — to be filed after
Vladyslav confirms; not filed in this session.

## 4. What an `infrastructure-security` dimension would contain

Derived from the six control groups of this report and checkable from a repo tree plus, optionally,
a read-only account collector (Prowler's OCSF output is the obvious source):

| ID | Check (detected) | Source standard |
|---|---|---|
| IS-01 | IaC present and applied from a pipeline, not a workstation (pipeline file references `terraform plan/apply` or an equivalent) | AWS SSB WKLD.15 |
| IS-02 | CI reaches the cloud by federation (`configure-aws-credentials` with `role-to-assume`, or a declared runner project in code); no `AWS_ACCESS_KEY_ID` secret | AWS SSB ACCT.13 |
| IS-03 | No `AdministratorAccess` / `Action:"*"` on a CI or workload role | SSB ACCT.04, WKLD.01 |
| IS-04 | Terraform state backend encrypted and locked; `sensitive = true` on secret-bearing variables/outputs | WA SEC 8 |
| IS-05 | Every `aws_s3_bucket` has a public-access block and an SSE configuration in the same module | SSB ACCT.08 |
| IS-06 | Database resources declare `storage_encrypted`, `deletion_protection`, and a TLS-enforcing parameter group | SSB WKLD.09 |
| IS-07 | ECR: `scan_on_push`, `IMMUTABLE` | CIS Docker / WA SEC 6 |
| IS-08 | Kubernetes workloads set a `securityContext` (non-root, RO fs, drop caps); Dockerfiles set `USER` | CIS EKS 4.x / Pod Security Standards |
| IS-09 | A misconfiguration scanner runs in CI over IaC/Helm/Dockerfiles (trivy, checkov, tfsec, kics, kube-linter) | SSB WKLD.15 |
| IS-10 | Detective services declared in code: CloudTrail, GuardDuty, Config or Security Hub | SSB ACCT.07/.14/.15 |
| IS-11 | CI variables / secrets that carry credentials are masked and protected (GitLab) or stored as secrets not variables (GitHub) | OWASP CI/CD Top 10 CICD-SEC-6 |
| IS-12 | AI workload: Bedrock invoke scoped to model ARNs; guardrails or invocation logging present | AWS AI Security Framework |

Weights and `applies_when` rules follow the existing `standards.toml` conventions; IS-08 applies when
Helm/Kubernetes manifests exist, IS-12 when any `bedrock:` action is granted.

## Not verified

- Whether the maintainers' current `main` still carries the AS-14 logic above (checked on the 2.4.4
  cache that produced the run; not re-checked upstream in this session).
- Whether any of the twelve proposed checks already exists in a newer engine release.
