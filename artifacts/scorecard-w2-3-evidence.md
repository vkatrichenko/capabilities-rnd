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
