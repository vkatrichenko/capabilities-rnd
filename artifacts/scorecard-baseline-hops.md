# OpenSSF Scorecard baseline — `hops`

Gate 0 item **G0.3**. This is the "before" against which W2.3 measures. Read-only; nothing was
changed in `hops`.

| | |
|---|---|
| **Run date** | 2026-08-18T15:25:28Z |
| **Tool** | OpenSSF Scorecard `v5.1.1-45-g40bbc9c9` (commit `40bbc9c95`) |
| **Image** | `gcr.io/openssf/scorecard@sha256:54c7ea4ddec6e3941887cb7933898c352f59e7f59e17a7a730f97ed348a8dfce` |
| **Target** | `github.com/provectus-barhopping/hops` @ `f640dee9f` (origin/main at run time) |
| **Mode** | Full remote (GitHub API), `--show-details` |
| **Aggregate** | **5.4 / 10** |
| **Raw output** | `scratch/scorecard-hops-2026-08-18-details.json` (gitignored — contains no secrets, but stays out of the repo by policy) |

Reproduce:

```
docker run --rm --platform linux/amd64 -e GITHUB_AUTH_TOKEN="$(gh auth token)" \
  gcr.io/openssf/scorecard@sha256:54c7ea4ddec6e3941887cb7933898c352f59e7f59e17a7a730f97ed348a8dfce \
  --repo=github.com/provectus-barhopping/hops --format=json --show-details
```

Scorecard queries the GitHub API and OSV/deps.dev. It publishes nothing — results are only
uploaded when a run explicitly opts in, which this one did not.

## Per-check results

| Score | Check | Reason |
|---:|---|---|
| 10 | CI-Tests | 30/30 merged PRs checked by a CI test |
| 10 | Code-Review | all changesets reviewed |
| 10 | Contributors | 3 contributing organizations |
| 10 | Dangerous-Workflow | no dangerous workflow patterns |
| 10 | Dependency-Update-Tool | update tool detected (Dependabot) |
| 10 | Maintained | 30 commits in the last 90 days |
| 10 | Packaging | packaging workflow detected |
| 9 | Binary-Artifacts | 1 binary: `hop-backend/gradle/wrapper/gradle-wrapper.jar` |
| 5 | Branch-Protection | not maximal on `main` — **see finding 1** |
| 0 | Vulnerabilities | **65 open advisories** — see finding 2 |
| 0 | Pinned-Dependencies | 150 unpinned refs — see finding 3 |
| 0 | Token-Permissions | no top-level `permissions:` in any of 10 workflows |
| 0 | SAST | "0 commits out of 30 checked with a SAST tool" — **false negative, see finding 4** |
| 0 | Security-Policy | no `SECURITY.md` |
| 0 | License | no license file |
| 0 | CII-Best-Practices | no OpenSSF badge |
| 0 | Fuzzing | not fuzzed |
| **−1** | **Signed-Releases** | **inconclusive — no releases exist.** Excluded from the aggregate; do not read a W2.3 change here as improvement |

**Not meaningful for this target:** `License`, `Security-Policy`, `CII-Best-Practices` and
`Fuzzing` are scored against open-source norms. `hops` is a private internal product repo, so
these four zeros are ~2.2 points of aggregate that no in-scope change would or should move.
Judge W2.3 on the individual checks, never on the aggregate.

## Findings

### 1. `main` requires no status checks — the secret-scan gate does not block merges

**Verified independently of Scorecard, from two GitHub endpoints:**

- `repos/.../rules/branches/main` → the only rules applying are `deletion`, `non_fast_forward`,
  `pull_request` (source: enterprise ruleset "Main Branch Protection", `provectus-global`).
- `repos/.../branches/main` → `"protection": {"enabled": false, "required_status_checks":
  {"checks": [], "contexts": [], "enforcement_level": "off"}}`.

Merging to `main` requires a PR and **1 approval**. It requires **zero passing checks**. So the
`secret-scan` gitleaks job — the enforcement layer the whole `hops` secret-scanning story rests
on, the one that flipped audit PRV-01 to PASS — is advisory at the merge boundary. Same for the
SonarQube MR scan and the osv audit.

This does not mean the gate is useless: it runs, it is visible, and PRs are reviewed. It means
**nothing mechanically stops a merge with a failing secret scan.**

Also disabled on `main`: enforcement for administrators, stale-review dismissal, CODEOWNERS
review, last-push approval.

**This is a repository-settings change, not a code change** — it needs a repo/org admin, and our
token is not one (`/branches/main/protection` is admin-only and 404s for us). It is therefore a
**recommendation to the HOPS tech lead**, not a Phase 2 PR. It is also the single highest-value
item Gate 0 surfaced.

### 2. AWOS measures that a gate *exists*, never that it is *enforced*

Searching all 13 dimensions of the 2026-08-03 audit for any branch-protection or
required-status-check concept returns **nothing**. The prevention-coverage checks read:

| Check | Status | What it actually asserts |
|---|---|---|
| PRV-01 | PASS 3/3 | "A secret-scanning gate (gitleaks, trufflehog, …)" **exists in CI** |
| PRV-03 | PASS 3/3 | "Static application-security testing **runs in CI** or pre-commit" |
| PRV-04 | PASS 3/3 | "A linter or formatter **is gated**" |
| PRV-06 | PASS 3/3 | "CI **runs** the test suite on every change" |

Every one is satisfied by a job that a merge can ignore. `prevention-coverage` 81.5% describes
the *presence* of prevention, not its *force*. Scorecard's Branch-Protection check is the exact
complement — which is the argument for running both, and a generalizable capability finding:
**"the control exists" and "the control is enforced" are two different measurements, and most
audit tooling only makes the first.**

Pairs with the detector blind spots already on record (AS-13, AIS-03, ADP-04, barley SEC-04).

### 3. 65 open dependency advisories — and the audit that would catch them is label-gated

Scorecard's OSV pass reports **65 distinct advisories** (GHSA IDs; full list in the raw JSON).
The `hops` CI dependency audit, `osv-audit-hop-ui`, runs **only when a PR carries the `frontend`
label** and covers **only `hop-ui`**. This is direct evidence for **W1.2** — previously argued
from the workflow condition alone, now with a number attached.

Advisory IDs are recorded but **not triaged**: Scorecard does not report severity, reachability,
or which manifest each comes from. Do not quote "65 vulnerabilities" as 65 exploitable issues.
Triage belongs to W1.2, using `osv-scanner` directly.

### 4. Unpinned CI dependencies — the same pattern Phase 1c found in `.mcp.json`

150 unpinned references:

| Count | Kind | Risk |
|---:|---|---|
| 100 | GitHub-owned actions (`actions/checkout@v7` style) | Low — GitHub-owned, tag-mutable |
| **17** | **third-party actions**, in `hops-dev.yml` (5), `hops-main.yml` (5), `hops-mr-check.yml` (5), `hops-demo.yml` (1), `hops-preview.yml` (1) | **High** — third-party code by mutable tag, the `tj-actions/changed-files` compromise class |
| 16 | download-then-run | Mixed — some already `sha256 -c` verified (bats, osv-scanner in the osv job); Scorecard does not detect the verification |
| 7 | container images | Mutable tags |
| 4 | npm commands | — |

The 17 third-party actions are the in-scope subset and are the CI-side twin of the `.mcp.json`
`:latest` / `@canary` / ref-less-git-URL finding. Same control, two surfaces: **an unpinned
third-party reference executing with the pipeline's (or the agent's) privileges.** That makes a
single "pin third-party execution surfaces" check the more coherent Phase 2 story than W1.4's
one-line `.mcp.json` fix on its own.

### 5. SAST 0 is a Scorecard false negative

Scorecard says "0 commits out of 30 checked with a SAST tool". `hops` runs a **SonarQube MR
scan** (`sonarqube-check-mr`, `sonar-project.properties`), and AWOS PRV-03 PASSes it. Scorecard
detects CodeQL and SonarCloud's hosted API; a self-hosted SonarQube instance is invisible to it.

Recorded so W2.3 does not chase it: **this zero is not a gap and should not be "fixed".** It is
the third independent detector blind spot found on this repo, and it cuts the other way from the
AWOS ones — evidence that no single scanner's score is a safe summary.

## What W2.3 can legitimately compare

| Check | Movable by Phase 2? |
|---|---|
| Pinned-Dependencies | Yes — pinning third-party actions |
| Token-Permissions | Yes — top-level `permissions:` blocks |
| Vulnerabilities | Yes — via W1.2 triage |
| Branch-Protection | Only by an admin acting on finding 1 |
| SAST | No — false negative, leave it |
| License, Security-Policy, CII-Best-Practices, Fuzzing | No — not applicable to a private product repo |
| Signed-Releases | No — inconclusive, no releases |
