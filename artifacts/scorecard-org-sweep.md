# Org-wide Scorecard sweep — `provectus-barhopping`, all 27 repos

Run 2026-08-23, read-only, Scorecard v5.5.0 (release binary, sha256-verified). Nothing was changed
in any repository; Scorecard queries the GitHub API and OSV/deps.dev and publishes nothing.

**Why this exists.** The research charter scopes four repos. The org has **27**. Scorecard costs one
command per repo, so the org-level picture was cheap to get — and it turns three findings that were
argued from `hops` into findings verified across the whole org.

| | |
|---|---|
| **Repos scanned** | 27 (26 with results; `dme-core` is empty — see below) |
| **Tool** | OpenSSF Scorecard v5.5.0 (`c395761df`) |
| **Raw output** | `scratch/org-sweep/*.json` (gitignored) |
| **Branch-protection cross-check** | `scratch/org-branch-protection.txt`, from `repos/*/branches/{default}` and `repos/*/rules/branches/{default}` |

Read per-check, never on the aggregate — six checks (License, Security-Policy, CII-Best-Practices,
Fuzzing, SAST, Signed-Releases) are the same constant for private repos and are omitted from the
table entirely. `*n/a*` is Scorecard's `-1`: inconclusive, almost always "this repo has no
workflows at all".

## The table

| Repo | Agg | Pinned | Token-Perm | Dang-WF | Binary | Code-Rev | CI-Tests | Branch-Prot | Dep-Update | Maintained | Vulns |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **`hops`** | 5.4 | 0 | 0 | 10 | 9 | 10 | 10 | 5 | 10 | 10 | 0 |
| `hops-fin-service` | 5.4 | 0 | 0 | 10 | 9 | 10 | 8 | 5 | 0 | 10 | 10 |
| `barley-fe` | 5.2 | 0 | 10 | 10 | 10 | 7 | 10 | 5 | 0 | 9 | 0 |
| `hops-infra` | 4.8 | *n/a* | *n/a* | *n/a* | 10 | 8 | 0 | 5 | 0 | 10 | 10 |
| **`hops-mcp`** | 4.7 | 1 | 0 | 10 | 10 | 9 | 10 | 5 | 0 | 10 | 0 |
| `core-infra` | 4.2 | *n/a* | *n/a* | *n/a* | 10 | 1 | 0 | 5 | 0 | 10 | 10 |
| `wort` | 4.2 | 8 | 0 | 10 | 10 | 0 | 10 | 5 | 0 | 10 | 0 |
| **`barley`** | 4.1 | 0 | 0 | 10 | 10 | 2 | 10 | 4 | 0 | 10 | 0 |
| `barley-langfuse` | 4.0 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `barley-core` | 3.7 | 0 | 10 | 10 | 10 | 1 | 10 | 5 | 0 | 0 | 2 |
| `sowa` | 3.6 | 0 | 0 | 10 | 10 | 8 | 10 | 5 | 0 | 0 | 0 |
| **`sowinsights`** | 3.4 | 0 | 0 | 10 | 8 | 0 | 0 | 5 | 0 | 8 | 0 |
| `hops-admin` | 3.2 | 0 | 0 | 10 | 9 | 0 | 0 | 5 | 0 | 4 | 0 |
| `assessor-infra` | 3.1 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `hubspot-connector` | 3.1 | 0 | 0 | 10 | 10 | 0 | *n/a* | 5 | 0 | 0 | 0 |
| `sowinsights-infra` | 3.1 | *n/a* | *n/a* | *n/a* | 10 | 1 | 0 | 5 | 0 | 1 | 10 |
| `barley-langfuse-infra` | 3.0 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `hops-k8s-manifests` | 2.9 | *n/a* | *n/a* | *n/a* | 9 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `hops-wireguard-infra` | 2.9 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `hops-deal-forecasting` | 2.8 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `malt-infra` | 2.8 | *n/a* | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `sowa-mcp` | 2.7 | 0 | 0 | 10 | 10 | 0 | 0 | 5 | 0 | 0 | 5 |
| `barley-nango-ui` | 2.6 | 0 | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 10 |
| `assessor` | 1.8 | 0 | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 0 |
| `malt` | 1.7 | *n/a* | *n/a* | *n/a* | 10 | 0 | 0 | 5 | 0 | 0 | 0 |
| `barley-labeling-ui` | 1.6 | 1 | *n/a* | *n/a* | 10 | 0 | *n/a* | 5 | 0 | 0 | 0 |

The four research-scope repos are in bold. `dme-core` is omitted: it has no default branch and
Scorecard returns `"checks": null` with an aggregate of `-1`.

## What the org-wide view establishes

### 1. "The gate is not enforced" is an org-wide fact, not a `hops` fact

The Gate 0 baseline established that `hops` `main` requires a PR and one approval and **zero passing
status checks**. Across the org, from two independent endpoints:

- **25 of 26** default branches require **no status check at all**.
- **One** — `barley` — requires exactly one: `CI Gate`, `enforcement_level: non_admins`.
- The enterprise ruleset `provectus-global` applies uniformly and carries only `deletion`,
  `non_fast_forward`, `pull_request`. **No `required_status_checks` rule type exists anywhere in
  the org.**

So every secret scan, SAST run, dependency audit and test suite in this organisation — including
the three gates this project shipped — is advisory at the merge boundary, in every repository but
one. It is a single org-level settings change, not 26 repo-level ones, and it is the highest-value
recommendation this research has produced.

### 2. Scorecard's Branch-Protection score inverts the thing it measures

`barley` is the only repo in the org that actually blocks a merge on a passing check. It scores
**Branch-Protection 4**. The 25 repos that block nothing score **5**.

The check is a weighted tier system — review counts, stale-review dismissal, up-to-date branches,
admin enforcement — and the one dimension anybody would act on is a minority of the weight. A
reader ranking these repos by that score would rank the only enforced repo last.

This is the second inversion found in one day. The first: all four research repos score
Token-Permissions 0, but `barley` declares top-level permissions in 27 of 28 workflows and loses on
two `contents: write` grants, while `hops` declares none anywhere. Org-wide the same check reads
**10 for `barley-core` and `barley-fe`, 0 for ten repos, and inconclusive for fourteen** that have
no workflows to score.

**The generalizable claim for the article: a per-check score is not monotone in the control it
names.** Two independent cases in one sweep, both found only by reading the details field. Scores
rank; details explain; and where they disagree, the details are right. That is the same lesson as
the AWOS `score`-vs-`coverage` correction from Phase 1, arriving from a different tool.

### 3. Dependabot exists in exactly one repository out of 26

`hops` is the only repo in the org with a dependency-update tool. Twenty-five have none — including
`hops-fin-service`, a Kotlin service that otherwise matches `hops` check for check (aggregate 5.4
both) and is on **zero open advisories** today. It has no mechanism to stay there.

The Phase 1 headline was "`hops` is the only repo of the four with any secret scanning". The org
view says the same shape holds for dependency updates across 26 repos: **security tooling here is a
property of one repository, not of the organisation.**

### 4. Half the org is dormant, and dormancy hides the gaps

**15 of 26** repos score Maintained 0 — no commits and no issue activity in 90 days. **14 of 26**
have no CI workflows at all, so Pinned-Dependencies, Token-Permissions and Dangerous-Workflow come
back inconclusive rather than bad.

That matters for how the numbers are read: a repo with no workflows cannot fail a workflow check.
Several near-bottom aggregates (`assessor` 1.8, `barley-labeling-ui` 1.6, `malt` 1.7) are low
because there is nothing there to score, not because something is misconfigured. Do not report
those as findings.

The nine repos that are actually maintained (Maintained >= 8) are where the gaps mean something:

| Repo | Advisories | Code-Review | Dep-Update | Pinned | Token-Perm |
|---|---:|---:|---:|---:|---:|
| `hops` | 58 | 10 | **10** | 0 | 0 |
| `hops-fin-service` | 0 | 10 | 0 | 0 | 0 |
| `hops-mcp` | 69 | 9 | 0 | 1 | 0 |
| `barley` | **286** | **2** | 0 | 0 | 0 |
| `barley-fe` | 104 | 7 | 0 | 0 | **10** |
| `wort` | 46 | **0** | 0 | **8** | 0 |
| `sowinsights` | 51 | **0** | 0 | 0 | 0 |
| `hops-infra` | 0 | 8 | 0 | *n/a* | *n/a* |
| `core-infra` | 0 | 1 | 0 | *n/a* | *n/a* |

`wort` is the find outside the charter's four: actively maintained, 46 open advisories, **zero of
its recent changesets reviewed**, and simultaneously the best-pinned repo in the org
(Pinned-Dependencies 8, against a ceiling of 1 anywhere else). Good hygiene in one dimension is no
predictor of any other.

### 5. An empty repository is a live fail-closed test

`dme-core` returns `"checks": null` and aggregate `-1`. Both implementations of the comparison tool
exit **2** on it — "not a Scorecard JSON result: no `checks` array" — rather than reading zero
checks as zero regressions. The failure mode the tool was written to avoid turned up in the wild on
the first org-wide run, without being planted.

## Scope note

This sweep measures; it changes nothing and expands no research scope. The four charter repos remain
the unit of analysis for Phase 1 and 2 findings. The three claims above are reported as org-level
context for the article and as one concrete recommendation (item 1) to whoever owns the
`provectus-global` ruleset.
