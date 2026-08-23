# W2.3 — OpenSSF Scorecard in `hops` CI, and the delta vs Gate 0

Roadmap item **W2.3**. Two deliverables: the posture delta since the Gate 0 baseline, and the CI job
that makes the measurement repeatable. Plus a four-repo posture table (step 4) for the article.

Read `artifacts/scorecard-baseline-hops.md` first — it is the "before", and its scope rules apply
here unchanged: **judge per-check, never on the aggregate.**

| | |
|---|---|
| **Run date** | 2026-08-23 |
| **Tool** | OpenSSF Scorecard **v5.5.0** (`c395761df`), release binary, sha256-verified |
| **Binary checksums** | `bac6371a…` darwin/arm64 (used here) · `83b90a05…` linux/amd64 — from `scorecard_checksums.txt` of the v5.5.0 release |
| **Targets** | `provectus-barhopping/{hops,barley,hops-mcp,sowinsights}` |
| **Mode** | Full remote (GitHub API), `--show-details` |
| **Raw output** | `scratch/scorecard-*-2026-08-23-*.json` (gitignored) |
| **hops commit** | `628b57db2` (`origin/main`, 2026-08-21) |

Reproduce:

```
curl -sSfL -o sc.tgz https://github.com/ossf/scorecard/releases/download/v5.5.0/scorecard_5.5.0_linux_amd64.tar.gz
echo "83b90a05c1540ef1390db1cd5711e5fd04be9c1d8537fb84d39d02092d6a8dff  sc.tgz" | sha256sum -c -
tar -xzf sc.tgz scorecard
GITHUB_AUTH_TOKEN="$(gh auth token)" ./scorecard \
  --repo=github.com/provectus-barhopping/hops --format=json --show-details
```

The Gate 0 baseline used the container image; this run uses the release binary of a **newer**
version. The version change is handled explicitly below rather than papered over.

## 1. The delta since Gate 0

Three columns, because two of them answer different questions. **G0.3** is the recorded baseline at
Scorecard v5.1.1-45. **Gate-0 commit re-read** is the same commit re-scanned at v5.5.0 — it isolates
tool drift from repository change. **Current main** is the after-state, post PR #515, #518, #528.

| Check | G0.3 (v5.1.1-45, `f640dee9f`) | Gate-0 commit re-read (v5.5.0) | Current main (v5.5.0, `628b57db2`) |
|---|---:|---:|---:|
| CI-Tests | 10 | 10 | 10 |
| Code-Review | 10 | 10 | 10 |
| Contributors | 10 | not run | 10 |
| Dangerous-Workflow | 10 | 10 | 10 |
| Dependency-Update-Tool | 10 | not run | 10 |
| Maintained | 10 | not run | 10 |
| Packaging | 10 | not run | 10 |
| Binary-Artifacts | 9 | 9 | 9 |
| Branch-Protection | 5 | not run | 5 |
| Vulnerabilities | 0 (65 advisories) | 0 (**65**) | 0 (**58**) |
| Pinned-Dependencies | 0 | 0 | 0 |
| Token-Permissions | 0 | 0 | 0 |
| SAST | 0 | not run | 0 |
| Security-Policy | 0 | 0 | 0 |
| License | 0 | 0 | 0 |
| CII-Best-Practices | 0 | not run | 0 |
| Fuzzing | 0 | not run | 0 |
| Signed-Releases | −1 | not run | −1 |
| **Aggregate** | **5.4** | 4.9 — *not comparable, see below* | **5.4** |

**No check moved.** Not one score changed between the Gate 0 baseline and current `main`, across a
tool-version change and three merged security PRs.

Three things that need saying about that table:

- **`--commit` runs a reduced check set.** The Gate-0 re-read produced **9 of 18** checks; the nine
  marked *not run* are the ones Scorecard evaluates against live repository state (branch rules,
  commit recency, contributor orgs, packaging workflows) rather than against a tree. Its aggregate
  of **4.9 is computed over that subset and must not be compared with 5.4.** The column is a
  tool-drift control for the nine checks it covers, nothing more.
- **Tool drift, measured, was zero on the checks that ran** — including the advisory count, which
  read 65 at both v5.1.1-45 and v5.5.0 on the same commit. That is a useful negative result: the
  version change is not silently moving the numbers this project reports.
- **The one real movement is invisible in the scores.** Open advisories fell **65 → 58** between
  2026-08-18 and 2026-08-23, and the score stayed 0 because Scorecard's Vulnerabilities check is
  saturated at "any advisory ⇒ 0". Do not report it as a win either: nothing in Waves 1–3 triaged
  dependencies, so this is upstream advisory churn, not our work. Triage is still **W1.2**.

### What the three merged PRs did and did not move

| PR | Landed | Scorecard effect |
|---|---|---|
| #515 pnpm toolchain pin + cooldown | 2026-08-19 | None. `minimumReleaseAge` is not a Scorecard concept, and the pnpm version is pinned in a Dockerfile Scorecard does not score. |
| #518 gitleaks allowlist scope | 2026-08-20 | None. Scorecard has no secret-scanning check at all. |
| #528 hallucinated-package gate | 2026-08-21 | None on scores. It added two GitHub-owned action references, so unpinned GitHub-owned actions went **100 → 102** — inside a check already at 0. |

This is the honest headline: **three real security improvements, zero Scorecard movement.** It is
not a failure of the work; it is a property of the instrument, and it is the argument for keeping
both instruments. Scorecard sees CI configuration and repository governance. It does not see secret
scanning, dependency cooldowns or package-name provenance. The AWOS audit sees those and does not
see enforcement. Neither is a summary of the other.

### The unpinned surface, unchanged

`Pinned-Dependencies` breakdown on current `main` (from the raw JSON, not the baseline's estimate):

| Kind | Pinned / total |
|---|---:|
| GitHub-owned actions | 0 / 102 |
| **Third-party actions** | **0 / 17** |
| download-then-run | 0 / 16 |
| container images | 0 / 7 |
| npm commands | 3 / 7 |

The 17 third-party actions are still the in-scope subset and still untouched — **W1.4** is the item
that moves this, and it is still open. The gated baseline records the check at 0, so W1.4 landing
will show as an improvement rather than being lost in the noise.

## 2. The CI job

Branch `HOP-0000/openssf-scorecard-posture-check` off `origin/main` @ `628b57db2`, commit
**`c0a93c356`**, 4 files, **not pushed**. Source of record for the portable copies:
`tooling/ci/scorecard/`.

| File | Purpose |
|---|---|
| `.github/workflows/hops-scorecard.yml` | Weekly cron on `main`, `workflow_dispatch`, and `push` to `main` filtered to `.github/workflows/**` |
| `scripts/check-scorecard.mjs` | Compare results against the committed baseline; exit 1 on a gated regression |
| `scripts/check-scorecard.test.mjs` | 22 offline self-tests, run by the job itself |
| `scripts/scorecard-baseline.json` | The ratchet — 12 tracked check scores plus what produced them |

**Design decisions worth defending:**

- **Not on `pull_request`.** Scorecard measures repository-level state a single PR does not change,
  and a full run is minutes of GitHub API calls. The three checks a merge realistically moves all
  read `.github/workflows/**`, so the path-filtered `push` trigger covers them; the weekly cron
  covers the rest.
- **A per-check ratchet, not a threshold.** The baseline file already explains why the aggregate is
  not a gate here. Six checks are gated, six reported, six ignored — every one of the 18 is
  classified, and a self-test fails if upstream adds a nineteenth, so a new check has to be
  deliberately classified instead of silently dropped.
- **Ignored, with the reason at the constant:** SAST (self-hosted SonarQube is invisible to
  Scorecard), License / Security-Policy / CII-Best-Practices / Fuzzing (open-source norms), and
  Signed-Releases (−1 while no releases exist).
- **Reported but never gated:** Vulnerabilities, Branch-Protection, Maintained,
  Dependency-Update-Tool, Contributors, Packaging. These move with the outside world or with
  repository settings no PR author owns. A gate that fails for reasons nobody can fix gets deleted.
- **Fails closed.** A gated check missing from the results, gone `-1`, or absent from the baseline
  fails the job. This is the third time this project has written that rule down after finding the
  opposite in the field — the gitleaks `regexTarget = "line"` defect (W1.6) and barley's fail-open
  cassette scrubber (W3.5).
- **A rise never auto-ratchets.** Moving the baseline is a reviewed commit, so the ratchet is
  visible in git history.

### Verification actually run

| Check | Result |
|---|---|
| `node --test scripts/check-scorecard.test.mjs` | **22 pass / 0 fail** — fully offline |
| Negative control: real results vs the true baseline | exit **0** |
| Positive control: baseline hand-raised (Binary-Artifacts 9→10) | exit **1**, names the check |
| Positive control: `Token-Permissions` deleted from a real results file | exit **1**, "missing from results" |
| Partial-run input (the 9-check `--commit` output) | exit **0** — all six gated checks were present, so this is correct, not a hole |
| Workflow YAML | `yamllint` clean; parses; step list as intended |
| **Does the new workflow move what it measures?** | Local Scorecard run on the branch **with** and **without** `hops-scorecard.yml`: Pinned-Dependencies 0/0, Token-Permissions 0/0, Dangerous-Workflow 10/10, Binary-Artifacts 9/9 — identical |

### Not verified, and why

- **Whether a Docker container action runs on the CodeBuild runners.** Every `hops` runner is
  self-hosted CodeBuild; `ossf/scorecard-action` is a Docker container action. Docker is present on
  those runners (the `check-hop-*-docker` jobs run `docker build`), but a container *action* is not
  the same thing as a `docker build` step. The workflow does not trigger on `pull_request`, so this
  cannot be proven before merge — the merge itself is a push to `main` touching
  `.github/workflows/**`, which fires the job immediately.
- **`GITHUB_TOKEN` vs user-token parity.** The baseline and this delta were measured with a user
  token. `main` is governed by an enterprise ruleset; upstream states repository rules are readable
  with the default `GITHUB_TOKEN` while classic branch protection is not. Branch-Protection (and
  possibly Code-Review) may read differently in CI. **Reconcile the first CI run against this file
  before anyone reads a difference as a posture change.**
- **Whether the weekly cron provisions a CodeBuild runner on a `schedule` event.** No `hops`
  workflow currently uses `schedule`.

## 3. Two findings from running the tool

### 3.1 Pinning the action does not pin the code it runs

`ossf/scorecard-action` is pinned in the workflow to commit
`2d1146689b8cda280b9bc96326124645441f03bc` (`v2.4.4`) — the correct practice, and the one W1.4 is
about. But the action's own `action.yaml` reads:

```yaml
runs:
  using: "docker"
  image: "docker://ghcr.io/ossf/scorecard-action:v2.4.4"
```

A **mutable tag**. The SHA pin fixes which `action.yaml` we read; the code that actually executes is
whatever `ghcr.io/ossf/scorecard-action:v2.4.4` resolves to at run time. This is the same control
gap the research found in `.mcp.json` (`:latest`, `@canary`, ref-less git URLs) and in the 17
unpinned third-party actions — found this time **inside the tool we adopted to measure it**, and one
layer below where anyone would look. Stated in the workflow header rather than hidden; not a reason
to reject the action, and the alternative (the release binary, sha256-verified) remains available if
this ever matters more than upstream compatibility.

Generalizable for the article: **"pinned" is a claim about one layer.** A SHA-pinned action, a
digest-pinned image built `FROM` a tag, a lockfile whose registry allows re-publication — each is a
pin with a mutable layer underneath it.

### 3.2 Scorecard silently degrades on a shell it cannot parse

Every `hops` run carries this line in the Pinned-Dependencies details:

> `Info: Possibly incomplete results: error parsing shell code: "foo(" must be followed by ): .github/workflows/hops-preview.yml:302`

Scorecard could not parse one workflow's shell and continued anyway, at `Info` severity, with
"possibly incomplete" as the only signal. The download-then-run and dangerous-pattern findings for
that file are therefore partial, and nothing in the score reflects it. Fourth detector blind spot on
record for this project, after AS-13, AIS-03 and barley SEC-04 — and the only one that announces
itself in its own output, if you read the details rather than the score.

## 4. Four-repo posture table

Same tool, same day, read-only. Nothing was changed in any repo; Scorecard publishes nothing.

| Check | `hops` | `barley` | `hops-mcp` | `sowinsights` |
|---|---:|---:|---:|---:|
| Binary-Artifacts | 9 | 10 | 10 | **8** |
| Branch-Protection | 5 | **4** | 5 | 5 |
| CI-Tests | 10 | 10 | 10 | **0** |
| Code-Review | 10 | **2** | 9 | **0** |
| Contributors | 10 | 10 | 10 | 10 |
| Dangerous-Workflow | 10 | 10 | 10 | 10 |
| Dependency-Update-Tool | 10 | **0** | **0** | **0** |
| Maintained | 10 | 10 | 10 | 8 |
| Packaging | 10 | 10 | 10 | 10 |
| Pinned-Dependencies | 0 | 0 | 1 | 0 |
| Token-Permissions | 0 | 0 | 0 | 0 |
| Vulnerabilities (advisories) | 0 (58) | 0 (**286**) | 0 (69) | 0 (51) |
| *SAST · License · Security-Policy · CII · Fuzzing* | *0* | *0* | *0* | *0* |
| *Signed-Releases* | *−1* | *−1* | *−1* | *−1* |
| **Aggregate** | **5.4** | **4.1** | **4.7** | **3.4** |

Commits scanned: `hops` `628b57db2`, `barley` `c3aec73c6`, `hops-mcp` `781336983`, `sowinsights`
`fe3ec3410`.

**Aggregates are for ordering only.** Six of the eighteen checks (the italic rows) are the same zero
for all four and carry no information about any of them: four are open-source norms, SAST is a false
negative wherever the SAST tool is self-hosted, Signed-Releases is inconclusive with no releases.
Roughly 2.2 of every aggregate here is that constant.

What the table actually says:

- **`hops` leads on process, not on hygiene.** Its wins are Code-Review 10, Dependency-Update-Tool
  10 (the only one of the four with Dependabot) and CI-Tests 10. Its zeros — pinning, token
  permissions — are shared with everyone.
- **`barley` Code-Review 2 (2 of 9 changesets approved).** A third instrument now says what the
  gitleaks history scan and its own audit said: the repo merges largely unreviewed. This is also the
  repo with 7 real-format credentials in history.
- **`barley`'s unpinned surface is an order of magnitude larger:** 50 unpinned third-party actions
  and **108 unpinned container images**, against `hops`' 17 and 7.
- **286 open advisories in `barley`** against 58 / 69 / 51. Same caveat as always: Scorecard reports
  advisory IDs with no severity or reachability, so 286 is not 286 exploitable.
- **`hops-mcp` is the clean-slate comparison and behaves like one** — 26 of 28 changesets approved,
  the only non-zero Pinned-Dependencies (1, from its single pinned npm command), and the smallest
  unpinned surface (3 third-party actions).
- **`sowinsights` scores its two Phase-1 findings independently.** Binary-Artifacts 8 names
  `app/__pycache__/*.pyc` — the committed `.pyc` files — and Pinned-Dependencies names
  `python:3.11-bullseye` in the Dockerfile, the mutable base image. Its CI-Tests 0 and Code-Review 0
  (2 of 23 changesets approved) are new: 3 merged PRs, none checked by CI.
- **Token-Permissions is 0 for all four — and the four zeros mean four different things.** This is
  the clearest illustration in the whole table of why a score is not a state:

  | Repo | Why it scores 0 |
  |---|---|
  | `hops` | **None** of its 10 workflows declares a top-level `permissions:` block |
  | `barley` | **27 of 28** workflows do declare one, almost all `contents: read` — it loses on two top-level `contents: write` grants (`deepeval-regen.yml`, `update-vcr-cassettes.yml`) and one workflow with none (`web-cd.yml`) |
  | `hops-mcp` | None of its 3 workflows declares one |
  | `sowinsights` | Its single workflow declares none |

  `barley` is materially **ahead** of `hops` on this control and scores identically, because the
  check is effectively a minimum over workflows. Read the details, not the score — and note where
  one of the two write grants sits: `update-vcr-cassettes.yml`, the workflow that re-records the
  cassettes that leaked a GitLab runner token (W3.5).

  It is still the cheapest cross-repo recommendation this research has produced: declare
  `permissions: contents: read` at the top of every workflow and grant upward per job, which is
  exactly what `hops-scorecard.yml` now models.

## 5. What this closes and what it does not

- **W2.3 delivered:** the measurement is repeatable in CI, gated per check, and the baseline
  survives in git rather than in shell history.
- **Still open — and Scorecard is now the instrument that proves it:** `main` requires zero passing
  status checks (baseline finding 1, Branch-Protection 5). That is a repository-settings change
  needing an admin. It remains the highest-value item Gate 0 surfaced, and the standing weekly run
  means it can no longer be quietly forgotten.
- **W1.2 and W1.4 both now have a scoreboard.** Pinned-Dependencies 0 and the 58 open advisories are
  in the committed baseline, so those items land as measured improvements.
