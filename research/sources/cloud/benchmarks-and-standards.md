# Benchmarks and standards used for the cloud-infrastructure standards table

Companion to `aws-security-sources-list.md` (the 41-source notebook list). This file records which
sources anchor each control group in the report, and what was actually read versus cited from
prior knowledge.

## Read in this research (2026-09-03, via the AWS Knowledge MCP)

**AWS Startup Security Baseline (SSB)** — https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-startup-security-baseline/
Foundational controls for a single-account architecture, aligned to the Well-Architected security
pillar — the right yardstick for three projects in one account.

Account controls: ACCT.01 contacts · ACCT.02 restrict root · ACCT.03 console access per user ·
ACCT.04 assign permissions · ACCT.05 MFA · ACCT.06 password policy · **ACCT.07 CloudTrail to a
protected bucket** · **ACCT.08 prevent public access to private S3** · ACCT.09 delete unused
VPCs/SGs · ACCT.10 Budgets · **ACCT.11 IAM Access Analyzer** · ACCT.12 Trusted Advisor ·
**ACCT.13 short-lived credentials** · **ACCT.14 GuardDuty** · **ACCT.15 Security Hub** ·
ACCT.16 Cost Anomaly Detection · ACCT.17 restrict API calls to used Regions.

Workload controls: **WKLD.01 IAM roles for compute** · WKLD.02 resource-based policies ·
**WKLD.03 secrets management service** · **WKLD.04 prevent secret exposure** · WKLD.05 detect
exposed secrets · WKLD.06 SSM instead of SSH · WKLD.07 CloudTrail data events for sensitive S3 ·
WKLD.08 encrypt EBS · **WKLD.09 encrypt RDS** · **WKLD.10 private subnets** · **WKLD.11 security
groups** · **WKLD.12 VPC endpoints** · **WKLD.13 HTTPS for public endpoints** · WKLD.14 edge
protection (WAF/Shield) · **WKLD.15 security controls in templates, deployed by CI/CD**.

Bold = controls the report's table maps directly onto.

**AWS Security Reference Architecture (SRA)** — https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/
Multi-account, Organizations-based; used here for the *direction* (where the three accounts should
head) rather than as a scoring baseline, since none of the projects is org-managed in code.

## Cited from the notebook list, not re-read here

- AWS Well-Architected Framework, Security Pillar (SEC 1–10) — the umbrella every AWS source aligns to.
- The AWS AI Security Framework — the source for the Bedrock control group (scoped invoke,
  guardrails, invocation logging, PrivateLink).
- Wiz: S3 best practices, security-group anti-patterns (`0.0.0.0/0`), AI workload protection.
- Sysdig: 26 AWS production practices (Organizations, centralized logging), 17 container practices
  (minimal base, non-root, scanning) — the source for the workload group's image controls.
- Snyk: IaC scanning of Terraform/Helm before deployment — the source for "scanner in CI".
- Spacelift: 14 IAM practices (managed policies, roles via IaC, key lifecycle).
- Palo Alto: top-10 AWS risks (IAM over-privilege, exposed keys, misconfiguration drift).

## From prior knowledge — to verify before publication

- **CIS AWS Foundations Benchmark** (v3.x/v4.x) — Prowler reports against it natively; the report
  quotes Prowler's per-control output rather than the benchmark text.
- **CIS Amazon EKS Benchmark** — section 4 (RBAC, service accounts, Pod Security Standards) backs the
  Kubernetes hardening controls; no copy was read in this session.
- **OWASP Top 10 CI/CD Security Risks** — CICD-SEC-2 (identity and access), -6 (insufficient
  credential hygiene), -8 (ungoverned 3rd-party services) map onto the CI-to-cloud findings.
- **Pod Security Standards** (Kubernetes) — `restricted` profile is the reference for the
  `securityContext` findings.

## The two synthesis documents in this folder

`Demystifying Cloud Security…` and `Strategic Roadmap…` are notebook syntheses (shared
responsibility, zero trust, defense in depth, IAM "14 mandates", SSDLC with IaC scanning, PQC, Falco
runtime). Used for framing; runtime security and PQC are recorded in
`../../findings/cloud-out-of-scope.md` as belonging to another capability.
