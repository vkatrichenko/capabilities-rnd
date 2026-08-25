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

## 6. Ported to the three sibling repos (2026-08-23)

All three branches are **committed and unpushed**; each needs its owners' go-ahead, as the gitleaks
port to `barley` did (#1636).

| Repo | Branch / commit | Base | Runner | Twin | Baseline |
|---|---|---|---|---|---|
| `barley` | `chore/openssf-scorecard-posture-check` `0333af457` | `origin/develop` `48aa81535` | `ubuntu-latest` | Python | agg 4.1 @ `c3aec73c6` |
| `hops-mcp` | `chore/openssf-scorecard-posture-check` `069a379` | `origin/main` | `codebuild-hops-mcp-…` | Node | agg 4.7 @ `781336983` |
| `sowinsights` | `chore/openssf-scorecard-posture-check` `9958596` | `origin/main` | `codebuild-hops-sowinsights-…` | Python | agg 3.4 @ `fe3ec3410` |

**One policy, two implementations, chosen by what each repo's own lint pipeline claims.** `hops` and
`hops-mcp` get the Node checker (`hops` already runs `node --test` on `check-new-deps.mjs`;
`hops-mcp` is TypeScript/npm and its `.prettierignore` and eslint `ignores` already exclude
`scripts/`). `barley` and `sowinsights` get a standard-library Python twin, because a Node script in
a Python repo is the same mistake in the other direction as the one W3.1 avoided when it ported
Python → Node for `hops`.

Two implementations of one policy drift unless something stops them:

- `tooling/ci/scorecard/agreement-check.sh` runs both against every real Scorecard result under
  three baselines each — the result's own (clean), one with a gated check raised (regression), one
  with a gated check removed (fail-closed). **15 of 15 comparisons agree**, byte-for-byte on stdout
  and identically on exit code.
- A self-test in the Python twin asserts its `GATED` and `REPORTED` lists appear in the Node source,
  and skips where the Node file is not present.

**Verification per repo:**

| Repo | Evidence |
|---|---|
| `barley` | 23 self-tests pass (1 skipped — no Node twin there); real-data run exits 0; **`ruff format --check` and `ruff check` clean under barley's own `pyproject.toml`**, which its `lint.yml` runs on changed Python files (the first pass was not formatted — running their linter caught it) |
| `hops-mcp` | 22 self-tests pass; real-data run exits 0; **`make check` passes** — their documented pre-commit gate, run after `npm ci`. Prettier claimed the new workflow YAML on the first attempt; `prettier --write` fixed it and the gate is green |
| `sowinsights` | 23 self-tests pass (1 skipped); real-data run exits 0; `yamllint` clean. No lint pipeline exists in that repo to satisfy |

**Two rolling-window checks are gated at today's value, deliberately.** `Code-Review` and `CI-Tests`
score over recent changesets, so they move with team behaviour rather than with configuration.
`barley` is baselined at Code-Review 2 (2 of 9 approved) and `sowinsights` at 0 — a further decline
fails the weekly run. That is a signal their owners should see, and it fails a scheduled job, never
a pull request. Called out in each PR body so the choice is theirs to reverse.

## 7. Org-wide sweep — `artifacts/scorecard-org-sweep.md`

All 27 repos in `provectus-barhopping`, same tool, same day, read-only. Three results that change
how earlier findings should be stated:

- **Baseline finding 1 generalizes.** 25 of 26 default branches require **zero** passing status
  checks; the enterprise ruleset `provectus-global` carries no `required_status_checks` rule type at
  all. `barley` is the only repo in the org that blocks a merge on a check. One org-level settings
  change, not 26 repo-level ones.
- **A second score inversion.** `barley` — the only enforced repo — scores Branch-Protection **4**,
  below the 25 that enforce nothing. Together with the Token-Permissions inversion in §4, that is
  two independent cases in one day of a per-check score ranking the wrong way round.
- **Dependabot exists in 1 of 26 repos** (`hops`). The Phase 1 headline about secret scanning has
  the same shape one layer out: security tooling here is a property of one repository, not of the
  organisation.

And one accidental validation: `dme-core` is empty, so Scorecard returns `"checks": null`. Both
twins exit **2** on it rather than reading zero checks as zero regressions — the fail-closed path,
exercised in the wild on its first org-wide run.

## 8. Fourth port: `wort` (2026-08-24)

`wort` is outside the charter's four. It was ported on **explicit fresh approval from Vladyslav
Katrychenko on 2026-08-24**, after §7's sweep identified it as the one repository outside the
research scope where a standing measurement pays: actively maintained (Maintained 10), 46 open
advisories, and Code-Review 0.

The rollout question it settles: **not all 27**. Filtering the org to "actively maintained **and**
has CI" leaves seven repos — the charter's four plus `hops-fin-service`, `barley-fe` and `wort`.
Sixteen of twenty-six score Maintained 0, and eleven have no GitHub Actions workflows at all, so
three of the six gated checks would read `-1` there and the weekly job would measure almost nothing.
For the dormant tail the right artefact is a periodic org sweep from one repo, not twenty-odd
workflows.

**Baseline** — Scorecard v5.5.0, `c29cbc4e4` (`origin/main`), 2026-08-24, aggregate **4.2**. Run
fresh against current `main` rather than reused from the 23 Aug sweep; identical on all 18 checks.

| Check | Policy | Score | What it is measuring |
|---|---|---:|---|
| `Pinned-Dependencies` | **gated** | 8 | 24 of 24 actions pinned by SHA — the best in the org — but 0 of 2 container images in the `Dockerfile` |
| `Token-Permissions` | **gated** | 0 | `app-deploy`, `tf-apply`, `tf-plan` each declare top-level `contents: read`; `ci.yml` declares none |
| `Dangerous-Workflow` | **gated** | 10 | |
| `Binary-Artifacts` | **gated** | 10 | |
| `Code-Review` | **gated** | 0 | 1 of 30 changesets approved |
| `CI-Tests` | **gated** | 10 | 28 of 28 merged PRs checked |
| `Vulnerabilities` | reported | 0 | 46 open advisories, all PYSEC |
| `Branch-Protection` | reported | 5 | PR + 1 approval required; admins exempt; **no status checks required** |
| `Maintained` | reported | 10 | |
| `Dependency-Update-Tool` | reported | 0 | no Dependabot, no Renovate |
| `Contributors` | reported | 3 | 1 contributing organisation |
| `Packaging` | reported | 10 | |

### 8.1 Two numbers that do not mean what they look like

**Token-Permissions 0 is the third instance of the non-monotonicity in §4.** Three of `wort`'s four
workflows declare a top-level `permissions` block; one that does not — `ci.yml` — takes the whole
check to zero. `barley` showed the same shape at 27 of 28. The check does not measure "how much of
this repo restricts its tokens"; it measures "does any workflow fail to". **A one-line addition of
`permissions: contents: read` to `ci.yml` would move this check 0 → 10.** It is deliberately *not*
included in the port — it is a change to a CI job this research does not own — but it is the single
highest-value line available in the org, and it is named in the PR body as a follow-up.

**Code-Review 0 against branch protection that requires an approving review.** `main` requires a
pull request and one approval, yet only 1 of the last 30 changesets carries an approval. Branch
protection also reports `'branch protection settings apply to administrators' is disabled`. The
rule exists and the merges are going around it. This is the sharpest single instance in the org of
the capability finding that a *declared* control and an *enforced* control are different measurements
— and unlike §7's status-check finding, here the setting is switched on and still not binding.

### 8.2 The gate is self-consistent about pinning

`Pinned-Dependencies` is gated at 8, and adding a workflow adds dependencies to the very check being
gated. Every action in the new workflow is therefore pinned by commit SHA
(`actions/checkout@de0fac2e4`, `actions/setup-python@5fda3b95a`,
`actions/upload-artifact@043fb46d1`, `ossf/scorecard-action@2d1146689`), reusing the exact pins the
repo already uses where they exist. A tag-referenced action added here would have failed this job on
its first run — the gate would have caught its own author.

### 8.3 Verification actually run

| Step | Result |
|---|---|
| `python3 -m unittest scripts.test_check_scorecard` | 23 tests, **OK (skipped=1)** — the skip is the Node-twin comparison, absent here |
| Real-data run, true baseline | exit **0**, "No gated check regressed" |
| Negative control, `Pinned-Dependencies` 8 → 9 in baseline | exit **1**, names `Pinned-Dependencies` and prints Scorecard's own reason |
| `uv run ruff check .` (repo-wide, `E,F,I,N,UP,B,SIM,TCH` @ 100) | **All checks passed** |
| `uv run ruff format --check` on both new files | **already formatted** |
| `uv run pyright` (repo-wide, the `make lint` gate) | **0 errors, 0 warnings** |
| `agreement-check.sh` over 5 real results × 3 baselines | **15 of 15 agree**, byte-identical stdout and exit code |

`wort`'s lint is materially stricter than `barley`'s — pyupgrade, bugbear, flake8-simplify and
`E501` enforced at 100 columns, plus pyright in basic mode over the whole repo. Satisfying it
required reworking the shared Python twin: `.format()` → f-strings (UP032), `raise … from` (B904),
`base.get(name)` (SIM401), and wrapping two long strings. The reworked file is **format-stable at
both 99 and 100 columns**, so a single source now satisfies `barley` and `wort` without a
per-repo fork.

One deliberate divergence remains, in the test file only: `scripts/` is a package in `wort`
(`__init__.py`), and pyright runs over the repo, so the import is `from scripts import
check_scorecard as sc` and the job runs `python3 -m unittest scripts.test_check_scorecard`.

### 8.4 Source drift in the two unpushed sibling branches — resolved 2026-08-25

The `barley` and `sowinsights` branches still carry the **pre-rework** revision of
`check_scorecard.py`. The difference is stylistic, not behavioural: both revisions were run against
three real Scorecard results under generated baselines and produced **byte-identical stdout and
identical exit codes**. Those branches are unpushed and can be refreshed before they open; doing so
was not attempted here, because a write to `barley` or `sowinsights` needs its own approval.

**Resolved 2026-08-25 on fresh approval.** Both branches were amended (unpushed and unreviewed, so
an amend rather than a follow-up commit) and now carry the canonical revision — verified
byte-identical to `tooling/ci/scorecard/check_scorecard.py` and its test by `diff`. Same amend
carried the token-permission fix from §9.

### 8.5 Not verified at the time of the port — since resolved, see §9

- **The first CI run.** The workflow fires on push to `main` touching `.github/workflows/**`, so
  the merge triggers it. Unlike the `hops` port there is no self-hosted-runner risk — `wort` runs
  `ubuntu-latest`, where the Docker container action is upstream's supported path.
- **`GITHUB_TOKEN` vs user-token parity.** The baseline was measured with a user token. As
  everywhere else in this work, the first CI value for `Branch-Protection` is a measurement to
  reconcile, not a regression to act on.

## 9. First real CI run — `wort` #216, and the bug it found (2026-08-25)

`wort` PR #216 merged; the push to `main` touched `.github/workflows/**` and fired the job.
[Run 32837708276](https://github.com/provectus-barhopping/wort/actions/runs/32837708276) —
**the job failed, and it was right to.**

### 9.1 What the run proved

Everything that was listed as unverifiable before a real run, verified:

| Previously unverified | Result |
|---|---|
| The Docker container action runs at all | ✅ `Pull ghcr.io/ossf/scorecard-action:v2.4.4` then `Run OpenSSF Scorecard`, both green |
| The self-tests run in CI, not just locally | ✅ `Self-test the comparison` green — 23 tests |
| The artifact survives a failing gate (`if: always()`) | ✅ `scorecard-results` uploaded from a failed job, and is the source of this section |
| Fail-closed behaviour on real degraded input | ✅ a gated check at `-1` failed the run instead of being read as zero regressions |

### 9.2 The bug: upstream's documented permission block is incomplete

Three checks returned `-1`. From the uploaded artifact, each with the API call that failed:

| Check | Policy | Baseline → CI | Cause |
|---|---|---|---|
| `CI-Tests` | **gated** | 10 → -1 | `Client.Repositories.ListStatuses` → `GET /commits/{sha}/statuses` **403** |
| `Packaging` | reported | 10 → -1 | `Client.Actions.ListWorkflowRunsByFileName` → `GET /actions/workflows/{file}/runs` **403** |
| `Branch-Protection` | reported | 5 → -1 | `githubv4.Query` branch-protection query **403** |

The first two need `statuses: read` and `actions: read`. **Neither scope appears in
`ossf/scorecard-action`'s README permission block** — which is precisely where this workflow's
permission list came from, quoted in §2 as "recommended reads for private repos". Following the
documentation exactly produced a job that could not measure two of its own checks.

Fixed by adding both read-only scopes, with the failing API call named against each so the next
person does not delete them as cargo cult. No write grant added.

`Branch-Protection` stays `-1` in CI by design: its GraphQL query needs repo-admin scope, which
`GITHUB_TOKEN` does not have and should not be given for a measurement job. It is a reported check,
never gated, so an inconclusive reading there says *not measurable from CI* rather than *regressed*,
and the baseline keeps the user-token value of 5 so the real reading is not lost. This is the
token-parity reconciliation §8.5 said would be needed — the answer is that one check is simply not
readable from CI, and that is now written down instead of rediscovered.

### 9.3 Why this is the strongest argument in the whole work item for per-check fail-closed gating

The aggregate fell **4.2 → 3.6** in the same run. Every point of that fall was measurement failure,
not posture. A gate written the obvious way — `fail if aggregate < 3.5`, or any threshold below
3.6 — would have **passed this run green** while three of eighteen checks silently stopped working.
The per-check ratchet failed it, named the check, and printed Scorecard's own 403 as the reason.

That is the same defect shape as the two Phase 1/2 controls this design was explicitly built
against: barley's fail-open cassette scrubber (W3.5) and the gitleaks `regexTarget = "line"` defect
(W1.6). Both reported clean while not working. **A security control's most important behaviour is
what it does when it cannot measure** — and this is the first time in this project that the
principle was tested by an accident rather than by a constructed fixture.

There is a second-order point worth keeping for the article: the check that broke was
`Token-Permissions`-adjacent in the most literal way. A job added to measure whether this
organisation grants its workflow tokens too much permission failed because it had been granted too
*little*. Least privilege has a floor, and finding it is an empirical exercise, not a documentation
one.

### 9.4 The same bug is latent in all four other ports

Every port copied the same permission block from the same upstream README.

| Repo | State | Baseline `CI-Tests` | Would have failed on first run |
|---|---|---:|---|
| `wort` | **merged**, fix on `fix/scorecard-token-permissions` `d36675a`, unpushed | 10 | it did |
| `hops` | PR #545 open, fix committed `827744ae3`, unpushed | 10 | yes |
| `barley` | branch amended `76d941ece`, unpushed | 10 | yes |
| `hops-mcp` | branch amended `3745270`, unpushed | 10 | yes |
| `sowinsights` | branch amended `9c4a454`, unpushed | 0 | yes — `0 → -1` is an inconclusive reading, which the comparison gates regardless of the baseline value |

**All five are now fixed** — the three sibling branches on fresh approval given the same day.
Catching this before `hops` #545 merged is the concrete payoff of having ported to a fifth
repository: the cheapest place to discover a configuration bug is the repository you are allowed to
break.

Verification of the three sibling fixes, each under that repo's own gate:

| Repo | Evidence |
|---|---|
| `barley` | 23 self-tests pass (1 skipped); `ruff check` and `ruff format --check` clean under barley's `pyproject.toml`; workflow parses, permissions read-only |
| `hops-mcp` | 22 Node self-tests pass; `prettier --check` clean on the workflow (it claimed the file on the original port, so this was worth re-running); permissions read-only |
| `sowinsights` | 23 self-tests pass (1 skipped); workflow parses, permissions read-only |

No baseline value changed in any of the five. The fix grants read scopes so the checks can be
measured; it does not move a score, and none of the ratchets were touched.

## 10. Second real run — `sowinsights`, and the runner assumption (2026-08-25)

`sowinsights` merged (#5) and the job fired:
[run 32840533614](https://github.com/provectus-barhopping/sowinsights/actions/runs/32840533614).
Failed — at a different step, for an unrelated reason.

### 10.1 The §9 fix is confirmed working

Read from the run's own Scorecard output before anything else, because it is the thing §9 could not
verify:

| Check | §9 symptom | This run |
|---|---|---|
| `Packaging` | -1, 403 on `ListWorkflowRunsByFileName` | **10** — `packaging workflow detected` |
| `CI-Tests` | -1, 403 on `ListStatuses` | **0** — `0 out of 4 merged PRs checked by a CI test` |
| `Branch-Protection` | -1, GraphQL 403 | -1, unchanged **and expected** — needs repo-admin scope |

Scorecard's own `Token-Permissions` details name the new grants at
`.github/workflows/scorecard.yml:58` and `:59`. `statuses: read` and `actions: read` were the fix,
and they hold.

### 10.2 The new failure: `actions/setup-python` does not work on a self-hosted runner

```
Set up Python
  python-version: 3.11
  ##[error]The version '3.11' with architecture 'x64' was not found for this operating system.
```

`actions/setup-python` resolves a **prebuilt interpreter by operating system** from the
`actions/python-versions` manifest, and that manifest covers the GitHub-hosted images only. These
are self-hosted AWS CodeBuild runners (`/codebuild/output/src…` in the log), which are not in it.

**This was a porting defect, and its shape is worth recording.** The step came from the `barley`
port, where it is correct — `barley` runs on `ubuntu-latest`. Copying a workflow between two repos
changed one thing invisibly: the `runs-on` label. No other workflow in `sowinsights` uses
`setup-python`, so the repo carried no precedent to copy, and nothing about reading the file would
have revealed the problem. **Porting a workflow means re-checking every step against the target's
runner, not only against its language.**

Fixed by removing the action. The checker is standard library only and needs nothing newer than
Python 3.9, so the runner's own `python3` suffices; the job now prints `python3 --version` first so
a future interpreter change is visible in the log rather than inferred from a traceback.

### 10.3 The comparison would have passed

Run offline against the artifact the failed job uploaded and the committed baseline — exit **0**:

> Pinned-Dependencies 0 → 1 · Code-Review 0 → 1 · Maintained 8 → 10 (improved) · everything else
> unchanged · Branch-Protection 5 → -1 (reported, not gated) · **No gated check regressed**

So the gate itself is correct on `sowinsights` today, and the `if: always()` artifact upload is what
made that provable from a job that died two steps earlier. That design choice has now paid for
itself twice in two runs.

### 10.4 Own dependencies pinned

The same commit pins `actions/checkout` and `actions/upload-artifact` by SHA. Scorecard's output for
this run listed **three of the four unpinned GitHub-owned actions in the org's `sowinsights` as
belonging to the Scorecard workflow itself** — a job that gates `Pinned-Dependencies` while leaving
its own dependencies on mutable tags. It did not fail anything (the baseline is 0, so 0 → 1 is an
improvement), which is precisely why it needed catching by reading rather than by the gate.

### 10.5 Status of all five ports

| Repo | State | Runner | Interpreter step | First run |
|---|---|---|---|---|
| `wort` | merged; fix PR #217 open | `ubuntu-latest` | `setup-python` 3.13 — **worked** | failed on tokens (§9), fix pending merge |
| `sowinsights` | merged; fix `25aa106` unpushed | CodeBuild | **removed** — was the failure | failed on `setup-python`, fix pending |
| `hops` | PR #545 open | CodeBuild | `setup-node@v7` | not yet run |
| `barley` | PR #1691 open | `ubuntu-latest` | `setup-python@v6` 3.12 | not yet run |
| `hops-mcp` | PR #55 open | CodeBuild | `setup-node@v4` | not yet run |

All three open PRs carry the §9 token fix — verified from their diffs.

**The one remaining unverified assumption**, stated because it is the same shape as the one that
just failed: `hops-mcp` uses `actions/setup-node` on a CodeBuild runner, and **no existing workflow
in `hops-mcp` uses `setup-node`** — its CI runs everything inside Docker. The reasons to expect it
to work are real but indirect: `hops` uses `setup-node@v7` on its own CodeBuild runners across five
workflows, and unlike `setup-python`, `setup-node` falls back to downloading from `nodejs.org` when
the tool-cache manifest has no match for the OS. That is an argument, not evidence. It resolves on
`hops-mcp` #55's first run.

## 11. Trigger and policy revision — PR-gated, not push-gated (2026-08-25)

Two red `main`s in one day (§9 `wort`, §10 `sowinsights`) prompted the right question from Vladyslav
Katrychenko: *why run this on merge at all, when the changes are already in?*

He is right, and the original design was wrong on this point. **Both failures were reported after
the fact, and both were caught by a run that could have happened on the pull request.** A
push-to-`main` run cannot prevent anything; its only remedy is a revert.

### 11.1 A claim of mine that did not survive checking

The argument for keeping push-to-`main` was that merges in this org bypass PRs, so a PR trigger
would not fire. Checked against the last 20 commits on each default branch:

| Repo | Commits arriving via a PR or merge commit |
|---|---|
| `wort` | 20 / 20 |
| `hops-mcp` | 20 / 20 |
| `sowinsights` | all — the apparent gaps are branch commits listed alongside their own merge commits, including GitLab-era `Merge branch … into 'main'` |

**These repos do not bypass pull requests; they bypass *approval*.** Scorecard's `Code-Review` check
counts approvals, and reading "1 of 30 approved" as "PRs are bypassed" conflated two different
things. Recorded because the original claim appears in §7 and §8 and would otherwise stand.

### 11.2 The trigger set

```yaml
on:
  schedule: [{ cron: '0 6 * * 1' }]   # the instrument
  workflow_dispatch:
  pull_request:                        # the gate
    branches: [main]
    paths: ['.github/workflows/**']
```

The cron is not decoration and is the reason `pull_request` alone is not enough: **most of what
Scorecard scores is not in any diff.** An advisory published against a dependency already present,
branch protection edited in the GitHub UI, a dependency-update tool switched off — no code event
fires for any of them.

**`barley` lists `develop` as well as `main`.** Its pull requests target `develop` (7 of the last 8
merged PRs). A trigger copied verbatim from a repo that merges into `main` would simply never have
fired there — the same porting failure as §10's `runs-on`, caught this time before it shipped.

### 11.3 The policy change gating on a PR requires

Failing a pull request is only defensible if every gated check is one its author can fix. Two were
not, so **`Code-Review` and `CI-Tests` move to reported-only**:

| | Before | After |
|---|---|---|
| **Gated** (4) | Pinned-Dependencies, Token-Permissions, Dangerous-Workflow, Binary-Artifacts, Code-Review, CI-Tests | Pinned-Dependencies, Token-Permissions, Dangerous-Workflow, Binary-Artifacts |
| **Reported** (8) | Vulnerabilities, Branch-Protection, Maintained, Dependency-Update-Tool, Contributors, Packaging | + Code-Review, CI-Tests |
| **Ignored** (6) | unchanged | unchanged |

Both score a rolling window of recent changesets, so they track team behaviour rather than the
commit being measured. Gating them means one pull request fails because two others merged unreviewed
that week — the precise dynamic that gets a gate deleted or bypassed.

This is not a new principle; it is the one already written in the script's own `REPORTED` comment
("failures nobody can fix, which is how a gate gets deleted"), applied consistently for the first
time. The resulting rule is clean enough to state in one line: **every gated check is a property of
the tree at the commit being measured.**

The two moved checks are still measured, still compared against the baseline, and still printed in
the job summary. **No baseline value changed in any repo** — both remain in `TRACKED`.

A self-test in each twin now asserts they are reported and not gated, so the decision lives in the
test suite rather than in a comment. `agreement-check.sh`'s mutation list was narrowed to gated
checks only; it had been raising `Code-Review`/`CI-Tests`, which after this change would have
compared two clean runs and quietly stopped testing anything.

### 11.4 Verification

| Repo | Branch / commit | Tests | Repo's own gate |
|---|---|---|---|
| `hops` | `2bcbfa766` on #545 | 23 Node | pre-commit clean |
| `barley` | `0d20b178c` on #1691 | 24 Python (1 skip) | `ruff check` + `format --check` clean |
| `hops-mcp` | `78ca553` on #55 | 23 Node | `prettier --check` clean |
| `wort` | `22ba350` on #217 | 24 Python (1 skip) | `ruff check .` + `pyright` clean |
| `sowinsights` | `41c0845` | 24 Python (1 skip) | no lint pipeline exists |

Plus, on the canonical pair: **15 of 15 agreement comparisons still byte-identical**, and the Python
twin still format-stable at both 99 and 100 columns. All five workflows parse, and all five now
expose exactly `pull_request`, `schedule`, `workflow_dispatch`.

### 11.5 What this buys beyond the immediate fix

`hops-mcp` #55 now **runs the job it adds**. That settles §10.5's open question — whether the
container action and `actions/setup-node` work on that repo's CodeBuild runners, where no existing
workflow uses `setup-node` — before the merge rather than after it. The pre-merge test is no longer
a one-off manoeuvre to be reverted; it is the permanent shape of the workflow, and every future edit
to the gate or its baseline gets the same treatment.

## 12. The comparison posts to the pull request — trialled in `hops-mcp` (2026-08-25)

With the gate now running on pull requests (§11), the output should be where the decision is taken.
It already rendered on the run summary page — the artifact holds only the raw JSON — but that is one
click into the Actions tab a reviewer has no particular reason to make.

Added to `hops-mcp` #55 first, deliberately, before the other four: it is also the branch that
settles §10.5's open runner question, so one run answers both.

| Requirement | Resolution |
|---|---|
| Job permission | `pull-requests: read` → **`write`**, at job level with top-level still read-only |
| Mechanism | `actions/github-script`, SHA-pinned `3a2844b7e` (v9.0.0) |
| Repeat pushes | upsert on a hidden `<!-- openssf-scorecard-gate -->` marker — edit one comment, never stack |
| Comment on failure | `if: always() && github.event_name == 'pull_request'` |

**The write grant costs nothing on the check this workflow gates**, which was worth verifying rather
than assuming. Upstream's `Token-Permissions` documentation:

> The highest score is awarded when the permissions definitions … are set as read-only at the top
> level and the required write permissions are declared at the run-level. … Though a project's score
> won't be penalized, the check's details will include warnings for more sensitive run-level
> permissions

`pull-requests` is not among the six scopes on that warning list (`actions`, `checks`, `contents`,
`deployments`, `packages`, `security-events`). Job-level write is the documented best-practice shape.

**`actions/github-script` over `gh pr comment`**, and the reason is §10's lesson rather than taste:
`gh` may or may not exist on a self-hosted CodeBuild runner, and assuming a tool is present is what
broke `sowinsights`. `github-script` runs on the Actions runtime itself. It is also what
`hops`, `hops-mcp` and `barley` already use to comment, so no new mechanism enters these repos.

**One restructure it forced.** The comparison step exits non-zero on a gated regression, so anything
appended after it in the same step never runs — including the summary. The checker now writes to
`scorecard-summary.md`, and two later steps guarded with `always()` consume it: the run summary page
and the comment. The file is written before the non-zero return, so a failing run still has one; the
comment step falls back to a short "no summary produced" body if the job died before the comparison.

Verified: `prettier --check` clean, workflow parses with the expected eight steps and permissions,
the inline `github-script` body passes `node --check`, and the 23 Node self-tests still pass.
Commit `7f930e1` on #55, **unpushed**. Not yet ported to the other four — that waits on seeing it
work once.

## 13. The first PR run — the comment works, the report did not (2026-08-25)

`hops-mcp` #55 pushed; run
[32846478467](https://github.com/provectus-barhopping/hops-mcp/actions/runs/32846478467) posted its
comment. **Three of §12's open questions resolved green in one run**: the container action works on
`hops-mcp`'s CodeBuild runners, `actions/setup-node` works there (§10.5's unverified assumption —
the indirect argument was right), and the upserted comment lands.

Then the comment itself showed the report was wrong.

### 13.1 `scorecard-action` runs in local directory mode on a pull request

From the run log:

```
getting repo info from file: /github/workflow/event.json
  Ref: HEAD
  Local: .
```

and from the artifact: `"repo": {"name": "file://.", "commit": "unknown"}`, **11 checks, not 18**.
The seven that need the GitHub API — `Code-Review`, `CI-Tests`, `Branch-Protection`, `Maintained`,
`Contributors`, `CII-Best-Practices`, `Signed-Releases` — do not run at all in that mode.

This is not a misconfiguration and not the "experimental trigger" caveat biting. Local mode is
**correct** for a pull request: it measures the tree being proposed, not the state of the default
branch. It is what makes the four gated checks meaningful on a PR at all.

### 13.2 What the report got wrong, and the part that is a real defect

| Symptom | Why it is wrong |
|---|---|
| Five tracked checks read `missing from results` | That string is the tool's language for *the measurement broke*. Nothing broke. |
| Header read `` `file://.` @ `unknown` `` | A fake repository name and a non-existent commit, presented as provenance |
| `Aggregate **3.4**` beside a baseline of 4.7 | 11 checks compared against 18 |
| **The job passed** | ← the actual defect |

**A run that measured 11 of 18 checks reported clean.** Fail-closed only ever covered *gated* checks
going missing, and all seven API-backed checks are reported. §11 made that worse without anyone
noticing: before it, `Code-Review` and `CI-Tests` were gated, so the first PR run would have failed
loudly on exactly this. Moving them to reported-only was right for its own reasons and **widened a
hole that already existed** — two changes, each defensible alone, combining into a silent
half-measurement.

That is the same failure shape this whole design was built against (barley's fail-open cassette
scrubber, the gitleaks `regexTarget` defect), found this time in the tool built to avoid it.

### 13.3 The fix: describe the mode, do not hide from it

- Seven API-backed checks are named in an `API_ONLY` constant and, **in local mode only**, reported
  as `not measurable in local mode` rather than `missing from results`.
- The header reads `local working tree` instead of a fake repo and commit.
- The aggregate is labelled: *"**not comparable** with the baseline: this run scored 11 of 18
  checks."*
- A note states the mode, what ran, and what did not.

**Fail-closed is unchanged where it matters.** A *gated* check absent from a local run still fails.
All four gated checks are file-based, so local mode is no excuse for one to be missing — and a gate
that cannot be evaluated is not a gate. In a remote run, an absent API check is still
`missing from results`, because there it genuinely means the measurement broke.

Resulting comment body:

> local working tree · Scorecard v5.5.0 · baseline `781336983`
> Aggregate **3.4** — **not comparable** with the baseline: this run scored 11 of 18 checks.
> … `Code-Review` reported — · `not measurable in local mode` …
> No gated check regressed.

### 13.4 Verification

| Check | Result |
|---|---|
| Node self-tests | **27 pass** (23 → 27; four new local-mode cases) |
| Python self-tests | **28 pass** |
| Agreement, incl. the real local-mode artifact | **18 of 18 byte-identical**, exit codes equal |
| `ruff` at 99 and 100 columns | clean, format-stable at both |
| `prettier --check` (hops-mcp's gate) | clean |
| Real local-mode result vs committed baseline | exit **0**, honest table |

The four new tests are the point, not the count: API checks marked rather than failed; **a gated
check absent from a local run still fails**; a remote run still calls an absent API check missing;
and the markdown says the aggregate is not comparable.

Commit `f3c3db4` on #55, **unpushed**. The other four repos still carry the pre-fix comparison and
would produce the same misleading report on their first PR run.

## 14. Final trigger shape: pull request + push, no filter, no cron (2026-08-25)

Decided by Vladyslav Katrychenko after §13: keep two triggers, drop `schedule` and
`workflow_dispatch`. Applied to all five repos, along with the two fixes proven in `hops-mcp` (§12
comment, §13 local-mode report).

```yaml
on:
  pull_request:
    branches: [main]        # barley: [main, develop] — its PRs target develop
  push:
    branches: [main]
```

### 14.1 Why these two cover the whole check set

`scorecard-action` branches on event name (`options/options.go:173`): `--local .` for
`pull_request`, `--repo` for everything else. So the two triggers are not redundant — they are the
two measurement modes:

| Trigger | Mode | Scores | Role |
|---|---|---|---|
| `pull_request` | local | 11 file-based checks, incl. **all four gated** | the gate — before the merge |
| `push` to default | remote | all 18, incl. the seven API-only | the full picture — after it |

Removing the cron costs one thing, stated plainly: **the seven remote-only checks now refresh only
when someone merges.** New advisories published against existing dependencies (69 open in
`hops-mcp`, 286 in `barley`) will not surface between merges, and in a quiet repo that could be
months. The counter-argument, which is the one taken: nobody was going to open a Monday run's
summary page. §13 exists because a defect sat visible on that page for two days and was found only
when the output was put in a pull request comment.

### 14.2 The path filter was wrong twice over

Removed from both triggers. It had been inherited from a design where `push` was the only trigger
and API cost was the concern.

- **Two gated checks read files outside `.github/workflows/**`.** `Pinned-Dependencies` reads
  Dockerfiles and package-manager commands — it flagged `Dockerfile:2` in `hops-mcp`'s own first
  run, and the mutable `python:3.11-bullseye` base image in `sowinsights`. `Binary-Artifacts` reads
  the whole tree — `sowinsights` scores 8 on committed `app/__pycache__/*.pyc`. **A pull request
  unpinning a base image or committing a binary would not have triggered the gate at all.**
- With no cron, filtering the `push` run would leave the seven remote-only checks refreshing almost
  never.

Cost of removing it: the job runs on every PR and every merge. Observed duration on `hops-mcp`:
**60–80 seconds**.

### 14.3 All five now carry the same shape

| Repo | Commit | Triggers | Path filter | `pull-requests` | Steps | Tests |
|---|---|---|---|---|---|---|
| `hops` | `c3edddbdc` (#545) | PR + push | none | write | 8 | 27 Node |
| `hops-mcp` | `6f12a67` (#55) | PR + push | none | write | 8 | 27 Node |
| `barley` | `cbe029af6` (#1691) | PR + push `[main, develop]` | none | write | 8 | 28 Python |
| `sowinsights` | `072d536` | PR + push | none | write | 7 | 28 Python |
| `wort` | `230f8fc` (#217) | PR + push | none | write | 8 | 28 Python |

`sowinsights` has seven steps rather than eight because §10 removed its `setup-python`.

Verified per repo: workflow parses with the expected triggers, permissions and step count; the
inline `github-script` body passes `node --check` in all five; `barley` and `wort` `ruff` clean,
`wort` `pyright` clean, `hops-mcp` `prettier --check` clean, `hops` pre-commit clean.

**Where the weekly report went.** There is no scheduled run any more, so the posture report lands
only on the run summary page of a merge, plus the PR comment. If that turns out to be too quiet, the
cheap fix is an upserted issue on the `push` run — the same `github-script` step with
`issues: write` — rather than bringing the cron back.

### 14.4 `barley`: the push trigger must be `main` only (2026-08-25)

Run [32852738128](https://github.com/provectus-barhopping/barley/actions/runs/32852738128) failed on
a push to `develop`:

```
::error ::Only the default branch main is supported.
```

`scorecard-action` refuses any non-`pull_request` event off the default branch, before running
anything — `options/options.go:122`:

```go
if !o.isPullRequestEvent() && !o.isDefaultBranch() {
    return errOnlyDefaultBranchSupported
}
```

§14 listed `[main, develop]` on **both** triggers for `barley`, reasoning that the repo integrates
on `develop`. That reasoning holds for pull requests and not for pushes, and the same validation is
why: `pull_request` events are exempt. The evidence is one run of each on the same branch — the PR
run on #1691 into `develop` **passed in 1m49s**, the push run to `develop` **failed in 27s**.

Corrected to `pull_request: [main, develop]`, `push: [main]` (`266815224`).

**The gate is unaffected** — it runs on every PR into `develop` and scores all four gated checks
against the proposed tree. What is lost is specific and worth stating: `barley` merges land on
`develop`, `main` sees a merge rarely (1 of the last 8 merged PRs), and the push run is the only one
that scores the seven remote-only checks. **In `barley`, those will now refresh rarely.** That is
§14.1's accepted cost, concentrated in the one repo where it bites hardest. If it matters there, the
fix is a schedule on `barley` specifically — not a push trigger that cannot work.

Two guards behaved correctly on the way down: `Publish the summary` succeeded rather than erroring
on a run that produced no file (the `[ -f ]` guard from §12), and the artifact upload warned instead
of failing. The job still failed, which is right — a measurement that did not happen is not a pass.

## 15. Closeout (2026-08-25)

W2.3 is complete. Scorecard runs as a standing control in four of the five repositories it was
ported to, and the fifth is approved and waiting on a merge button.

### 15.1 Where each port stands

| Repo | Landed | Still open | Notes |
|---|---|---|---|
| `hops-mcp` | **#55 merged** | — | The trial repo. Its first PR run found §13's fail-open and settled §10.5's runner question |
| `wort` | **#216 merged** | #217 — token scopes + trigger shape | `main` currently runs the §9 pre-fix workflow |
| `sowinsights` | **#5 merged** | #6 — runner fix + trigger shape | `main` currently runs the §10 pre-fix workflow |
| `barley` | **#1691 merged** | #1699 — push trigger `main` only | `develop` currently fails on every merge until #1699 lands |
| `hops` | — | **#545 — approved, mergeable, unmerged** | Carries every fix from §9–§14 in one branch |

**Stated plainly because the report is evidence: `hops` has not merged.** #545 is `APPROVED` with
`mergeStateStatus: CLEAN`, and `hops-scorecard.yml` is not on `hops`' default branch. It is the only
one of the five whose workflow has never executed — and, because every correction from §9 onward was
folded into it before it merged, the only one that will be correct on its first run.

Three of the four merged repos need their follow-up PR to reach a working state. That is a direct
consequence of merging before the pattern had stabilised, and it is the clearest argument in this
work item for the trial-in-one-repo discipline that §12 adopted late.

### 15.2 What actually shipped

- **A gate**, in five repositories: four checks — `Pinned-Dependencies`, `Token-Permissions`,
  `Dangerous-Workflow`, `Binary-Artifacts` — compared per-check against a committed baseline, failing
  the pull request on a drop, fail-closed on a broken measurement.
- **Two implementations of one policy**, Node and stdlib Python, chosen per repo by what that repo's
  CI already has, held to byte-identical output by `agreement-check.sh`.
- **A baseline per repo**, committed, raised only by a reviewed commit.
- **The report where the decision is taken** — upserted PR comment, plus the run summary page and a
  JSON artifact.
- **Research output**: the four-repo posture table (§4), the 27-repo org sweep
  (`artifacts/scorecard-org-sweep.md`), and the Gate-0 delta (§1).

### 15.3 What was learned, and what it cost

Five defects, none found by review:

| # | Defect | Found by |
|---|---|---|
| §9 | Upstream's documented permission block omits `statuses` and `actions` | a failed run |
| §10 | `setup-python` does not work on self-hosted CodeBuild runners | a failed run |
| §13 | A local-mode run reported clean on 11 of 18 checks — a fail-open we wrote | putting output in front of a person |
| §14.2 | The `paths` filter left two of four gated checks unenforced | a user question about something adjacent |
| §14.4 | `scorecard-action` rejects `push` off the default branch | a failed run |

Four of the five were in the harness around Scorecard, not in Scorecard. The measurement was right
from day one; the plumbing took a week.

### 15.4 Honest assessment of the standing control

Recorded so the article does not overclaim. **Eight of the twenty gated check-instances across the
five repos sit at 0 and cannot fall** — `Token-Permissions` is 0 everywhere, `Pinned-Dependencies` is
0 or 1 in four of five. What is genuinely live is `Dangerous-Workflow` (10 everywhere),
`Binary-Artifacts` (8–10), and `wort`'s `Pinned-Dependencies` at 8. The scores are also normalised
ratios, so small regressions may not move a score at all.

And the check that motivated adopting Scorecard for this research — `Branch-Protection`, the only
instrument here that measures whether a control is *enforced* rather than present — **cannot be read
from CI at all**; its GraphQL query needs repo-admin scope. It works only from a user token, run by
hand. The finding stands; it does not live in the workflow.

The highest-value output of this work item was never the gate. It was the measurement: 25 of 26
default branches requiring zero status checks, Dependabot in 1 of 26, and `wort`'s branch protection
switched on and routed around. One org-level ruleset change is still worth more than everything
gated here combined.

### 15.5 Open, not blocking

1. **Three follow-up PRs** — `wort` #217, `sowinsights` #6, `barley` #1699 — each fixing a repo whose
   `main`/`develop` currently runs a superseded workflow.
2. **`hops` #545** to merge.
3. **Two dead gates could be made live cheaply.** `permissions: contents: read` in `wort`'s `ci.yml`,
   and in `hops-mcp`'s three workflows without a top-level block, moves `Token-Permissions` 0 → 10;
   re-baselining at 10 converts an inert gate into a live one. Neither is in scope for these ports —
   both are changes to CI jobs this research does not own.
4. **No scheduled run anywhere**, by decision (§14.1). The seven remote-only checks refresh only on a
   merge to the default branch, and in `barley` — which integrates on `develop` — that is rare. If it
   proves too quiet, an upserted issue on the push run is the fix, not a restored cron.
5. **The org-level ruleset change**, still unowned.

## 16. All merged; first runs green (2026-08-25)

| Repo | PR | Merged | Workflow on default branch | First run |
|---|---|---|---|---|
| `hops` | #545 | 13:38 | `hops-scorecard.yml` | **success** — push on `main`, run 32854576604 |
| `hops-mcp` | #55 | earlier | `hops-mcp-scorecard.yml` | success — push on `main` |
| `wort` | #216 + #217 | 13:33 | `scorecard.yml` | success — push on `main` |
| `sowinsights` | #5 + #6 | 13:39 | `scorecard.yml` | success — push on `main` |
| `barley` | #1691 + #1699 | 13:33 | `scorecard.yml` on `develop` | success — **`pull_request` on an unrelated feature branch** |

`barley`'s latest run is the most interesting of the five: `pull_request` on
`fix/IGAL-2724-entity-name-substitution-guard`, a branch that has nothing to do with this work. The
gate is now running on ordinary product pull requests, which is the whole point.

### 16.1 The token-parity question, finally answered

Opened in the plan as *not verifiable before merge*, restated in §8.5 and §9. `hops`' first CI run
scored **all 18 checks** and reconciles against the user-token baseline exactly:

| | Baseline (user token, `628b57db2`) | CI (`GITHUB_TOKEN`, `dca2ed7b0`) |
|---|---:|---:|
| Pinned-Dependencies · Token-Permissions | 0 · 0 | 0 · 0 |
| Dangerous-Workflow · Binary-Artifacts | 10 · 9 | 10 · 9 |
| Code-Review · CI-Tests | 10 · 10 | 10 · 10 |
| Vulnerabilities · Maintained · Contributors · Packaging | 0 · 10 · 10 · 10 | 0 · 10 · 10 · 10 |
| Dependency-Update-Tool | 10 | 10 |
| **Branch-Protection** | **5** | **-1** |

**Eleven of twelve tracked checks match exactly.** The twelfth is the one predicted in §9:
`Branch-Protection`'s GraphQL query needs repo-admin scope, so it is unreadable from CI and reports
inconclusive — reported, never gated, with the baseline holding the real user-token value. Aggregate
5.5 vs 5.4, and the difference is that `-1`, not a posture change.

No gated check regressed. The gate passed on its first run in the repository it was built for.

### 16.2 Status: W2.3 complete

Five repositories, eight merged pull requests for the Scorecard work, five green first runs, and the
control now fires on ordinary product pull requests. The follow-ups from §15.5 items 1 and 2 are
closed. Items 3–5 remain open and are recommendations, not work in flight.
