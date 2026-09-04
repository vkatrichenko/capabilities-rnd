# Target state — what "finished" looks like for our cloud infrastructure

The counterpart to `hops-infra-gap-analysis.md`: that file lists the work, this one describes the
destination. Written as a picture rather than a settings list, because the settings change and the
picture does not. Each paragraph is the state in which all controls of that group in
`../baseline/cloud-control-scores.md` would be `pass`. Rendered in plain language in the report's
*How we score* tab.

## Getting in — identity

Each project's pipeline has **its own** identity, defined in code and reviewable in a pull request.
That identity may push its own images, deploy its own applications and read its own configuration
parameters, and nothing else; it authenticates per job with short-lived credentials, and the trust
policy names the exact repository and branch that may use it. A change in the smallest project cannot
reach the largest one. Workload identities enumerate their actions rather than granting a service
wholesale. People reach production through a time-limited request with a second factor; no standing
human grant carries delete on production data, and the account's root login is protected by a
hardware key in a safe. Nothing, human or machine, is a permanent administrator, and no identity is
`system:masters`.

## Data protection and workload hardening

Every database is encrypted with a customer-managed key, refuses unencrypted client connections
through a parameter group, and carries deletion protection. Every bucket declares a public-access
block, encryption and a TLS-only policy in the same module that creates it — asserted in code, not
inherited from an account default that a future account would not have. The Terraform state is
encrypted with our own key and every secret-bearing value is marked sensitive, so no password is
printed by a plan. Secrets live in the vault, rotate on a schedule, and the rotation reaches running
workloads automatically; no password appears in a URL, a command line, a CI variable or a values
file. Containers run as an ordinary user on a read-only root filesystem, with privilege escalation
disabled and all capabilities dropped, from a chart default rather than a per-service decision. Every
image is scanned on push into an immutable-tag registry, and the pipeline installs its own tooling
from pinned, checksum-verified versions.

## Network

The cluster's API endpoint is private, or restricted to our own address ranges. Workloads sit in
private subnets and reach AWS services over endpoints carrying policies that say what may travel
them, including one for the AI service. Flow logs are on. Everything public is HTTPS-only on a
current TLS policy and sits behind a filter; engineering tools — trace viewers, dashboards, metrics —
are on the internal network behind the company identity provider, not on the public internet behind a
shared password. Security groups name their sources; the open-world default in a shared module is
removed so that reaching for it is deliberate.

## Detection and governance

Activity recording and configuration history keep arriving from the IT-managed organization, and we
can name who owns them — the correct home for an account-level control in a member account. Threat
detection and the security dashboard are on as well, either delegated organization-wide by IT or
declared in our own code, so that disabling one is a visible change somebody has to approve; the
account holds no half-configured local duplicate of something IT already does properly. The permission
analyser and a password policy are on; the account-level public-access block and default volume
encryption are set; network flow logs are recording. Every infrastructure change is previewed for a human and machine-checked
before it can apply, and a change that would remove one of these protections fails the check. Every
resource carries an owner tag. Alarms reach a named person with a written procedure. A recurring
audit measures all of it on a cadence, so the score moves on a schedule rather than when someone
remembers to look.

## AI workload on AWS

The AI service may invoke only an explicit list of approved model ARNs, over a private endpoint.
Invocation logging is enabled and a guardrail with the full policy set sits in front of the models,
both declared in code. Usage and cost alarms are dimensioned per project, so one team's spike does
not page another team in the shared account.

## How far away it is

Most controls are a one-line or one-file change once someone decides to make them: image scanning,
`rds.force_ssl`, `deletion_protection`, `sensitive = true`, a `securityContext` block, a model-ARN
list, a bucket's three declarations. Four are structural, and they are the ones that keep the rest
from decaying:

1. **Split the shared CI identity** into one role per project (task T3).
2. **Close the cluster's public API endpoint** and encrypt its secrets with a CMK (T4).
3. **Scope the secret store per project** instead of one account-wide reader (T5).
4. **Put a review-and-check pipeline in front of every infrastructure repository** (T-I5).

Nothing above is exotic and nothing requires a product the org does not already own — the good copy
of almost every control exists somewhere in these repositories today (`cross-repo-infra-findings.md`
F3). The capability is making the good copy the only copy.
