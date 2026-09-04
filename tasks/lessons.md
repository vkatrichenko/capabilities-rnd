# Lessons

Corrections received, written as the rule that would have prevented the mistake. Review at session
start.

One entry per lesson: what went wrong in a sentence, then the rule. Keep the rule actionable — "be
careful with X" is not a rule; "verify X against Y before claiming Z" is.

---

## 2026-08-14 — Misread audit `score` as a percentage

Treated the AWOS audit's `score` field (32.6, 37.5, 45…) as percent-of-100 and called
prevention-coverage "the weakest area." It is a raw weight sum; the health metric is `coverage`
(awarded/applicable-max), and the real numbers were 80–100%. The wrong reading survived into
CLAUDE.md and a session report before being caught.

**Rule:** before quoting any metric from an unfamiliar report format, verify its semantics from
the data itself (recompute from raw fields, or find where the official report presents it) —
never infer meaning from a field name.

## 2026-08-14 — Lockfile grep pattern too narrow

Claimed "hop-ui has no lockfile" after grepping for `package-lock.json|yarn.lock|bun.lockb|
gradle.lockfile`. hop-ui uses **pnpm** — `pnpm-lock.yaml` existed all along. The claim survived
into two files before the audit's SCS-01 evidence contradicted it.

**Rule:** a negative claim ("X does not exist") needs an exhaustive pattern list for the
ecosystem (npm/pnpm/yarn/bun; poetry/uv/pipenv; gradle catalog/lockfile/verification-metadata) —
or better, assert from what IS there (the package manager in use) rather than from absence in a
hand-rolled pattern.

## 2026-08-18 — Treated a SKIPped audit check as a closeable gap

The approved Phase 2 plan said W1.1 "closes SCS-04". SCS-04 is `SKIP`/`applies:false` — the
detector cannot evaluate quarantine age offline and skips it by design, so no change to the repo
can flip it. The plan promised a before/after number that could never appear. Found only by
re-reading the audit JSON at Gate 0, after the plan was approved.

**Rule:** before planning work against an audit check, read that check's `status` and `applies`
fields *and its evidence strings* from the JSON — not the summary. `SKIP` means "not measured"
and `FAIL` means "measured and absent"; only the second is closeable. State up front which
planned items produce a measurable delta and which need their own evidence.

## 2026-08-19 — Read the skipped CI jobs, not just the failed one

On PR #515 the red check was a PR-template field. Fixing it would have closed the task. The
actual finding was in the jobs marked "skipping": frontend unit tests, SonarQube and the osv
audit all gate on a `frontend` label the PR did not carry, so a change to hop-ui's package
manager ran none of them. Phase 1 had recorded only the osv job as label-gated.

**Rule:** when reviewing a CI run, enumerate the skipped jobs and check each one's condition
against the diff. A gate that does not run is indistinguishable from a gate that passed in every
summary view, and "skipping" is the state nobody reads.

## 2026-08-19 — Branched from a clone that was 229 commits stale

The whole barley triage — 110 findings, every false positive classified — was
run against a local `main` that was 229 commits behind `origin/main`. It only
surfaced when creating the PR branch from `origin/develop`. On the real base the
count was 89, and 3 findings reported as "still in HEAD" had already been
scrubbed. Second occurrence: the hops Gate 0 baseline was pinned to a commit 5
days stale for the same reason.

**Rule:** `git fetch` and resolve the actual base ref **before** any measurement,
not before the commit. State the measured ref by SHA in the output
(`develop @ 230d4fa68`), so a stale number is visible instead of plausible.

## 2026-08-19 — Wrote the allowlist before triaging what it suppresses

The first `.gitleaks.toml` draft for barley copied hops' `regexTarget = "line"`.
The tuned scan returned 3 findings and looked like a clean result — but 3 real
`gitlab-rrt` tokens had been silently dropped by the allowlist, not by any rule
in it. Had the triage been done after writing the config instead of before, "6
real findings became 3" would have read as success.

**Rule:** for any suppression config — scanner allowlists, lint ignores, waiver
files — measure the untuned baseline first, then require every suppressed item to
be attributable to a named entry, and delete entries that match nothing. Pair it
with a planted-input control: put a synthetic positive inside each suppressed
context and confirm it is still detected. A suppression rule you have not proven
narrow is indistinguishable from a disabled check.

## 2026-08-19 — A correction that only landed in the file that owned it

The rotation runbook corrected barley's leak count from 22 to 7 distinct credentials on
2026-08-18 (22 counted occurrences across commits, not values). That correction never left the
runbook. The published report — the artifact managers actually read — kept 22 in its headline
KPI, its manager summary, its thesis callout, its bar chart and two roadmap rows for a further
day, alongside a stale "24 real-format leaks" and "3 still in HEAD".

**Rule:** when a number is corrected, grep every derived artifact for the old value in the same
change — reports, slides, summaries, README tables — and fix them together or record explicitly
which ones still carry it. A correction filed only where the number was born leaves the wrong
figure in the place with the widest audience.

## 2026-08-19 — Measured a false-positive rate against the wrong clock

The first replay of the hallucinated-package check over 40 historical commits returned 0 false
positives — but it judged each package's age against *today*, so every historical addition looked
mature by construction. The measurement could not have produced any other answer. Redone against
each commit's own date, the result happened to hold, but the first run was not evidence.

**Rule:** when replaying a time-sensitive check over history, pin every time-dependent input to the
point in history being replayed. If a measurement cannot produce a bad result, it is not a
measurement — say what would have had to be true for it to fail, and check that it could have been.

## 2026-08-19 — zsh ate a git ref and returned nothing

`git show "$cm:hop-ui/package.json"` produced empty output for every commit in a loop. zsh applied
its `:h` history modifier to the unbraced parameter. No error, no warning — just empty files and a
replay that reported "no commits added dependencies", which looked like a plausible finding.

**Rule:** brace parameters whenever a `:` follows them in zsh (`${cm}:path`). More generally, when
a loop over real data returns *nothing*, treat that as a bug until proven otherwise — a silent
empty result is the failure mode most likely to be mistaken for a finding.

## 2026-08-25 — Answered "which repos?" by counting the wrong thing

Asked whether the hook-content scan should be hops-only, I answered from `hooks` blocks: hops 4,
hops-mcp 2, barley 0, sowinsights 0 — therefore only two repos have anything to scan, therefore
barley's gate would be a tripwire on an empty surface. The user pushed back ("why no gate in all four
repos... what is the difference?"), which sent me to read barley's `.claude/settings.json` properly.
It enables three marketplace plugins from `github: provectus/awos` with no ref. Plugins ship hooks,
agents and skills. Barley's surface is not empty; it is the largest of the four and the only
*indirect* one — nothing local to review, third-party code resolved at session start.

I had also reached for a harness argument (does the repo even have CI?) that was false: all four have
workflows, and all four already carry a Scorecard workflow from W2.3.

**Rule:** before scoping a control by "which repos have X", enumerate what X actually is by reading
one repo's config end to end, not by counting the field you already know about. And when reaching for
a reason a control does not apply somewhere, verify the reason — an unverified constraint that
happens to support the answer you already gave is the easiest kind of wrong.

## 2026-08-25 — Wrote a false-positive count I had not measured

The sweep artifact claimed the first draft of the rules produced "14+ findings on `block-secrets.sh`
alone". No such run existed. Three of the four narrowings were made at design time, from reading the
scripts before running anything, so they never produced a measured regression at all — I had
back-filled a number that felt right for a story about calibration, in a document whose entire
purpose is evidence.

The fix was cheap: run each naive rule form against the two real scripts and count. The real numbers
(18, 7, 4, 1, 1 → 0) are better than the invented one, and the shape of the story changed — most of
the calibration was prevention, not repair, which is worth saying plainly.

**Rule:** a number in an evidence document must come from a command that was run. If a narrowing was
made at design time and never measured, either measure it retrospectively or say it was a design
decision — never assign it a plausible figure.

## 2026-08-25 — Shipped a commit message as a PR body, and CI caught what I had not read

Both hops pull requests failed `Spec link – PR template` on their first run. Not for anything in the
diff: the bodies were the commit messages, and hops enforces a `Spec:` field from its PR template in
CI (SDD-04, audit 2026-07-17 R6). #556 had no template at all; #557 had it appended below, with the
field still holding the unfilled HTML hint comment, which the check strips before looking — so it
read as empty.

I had read `.github/workflows/` closely enough to add a job to `hops-mr-check.yml` and to mirror
`spec-link-check.yml`'s trigger design in my head, and still did not read what that workflow
*enforces* about the thing I was about to submit.

**Rule:** a commit message is not a PR body. Before opening a PR in any repo, read
`.github/pull_request_template.md` and any workflow that validates the body, and fill the template.
Where a check parses text, simulate it locally against the draft — the same pipeline, in the same
locale — before pushing. Both corrected bodies were run through `spec-link-check.yml`'s exact
perl/grep/sed pipeline under the default locale and `LC_ALL=C` before being applied; both passed on
the first CI run afterwards.

## 2026-09-04 — Trusted a README pointer to GitLab; the org had moved to GitHub

The hops `infra/README.md` pointed at `gitlab.provectus.com/…/internal-projects-iac/hops`, a local
clone of it existed, and the whole IaC survey was built on that — 42 commits behind the real repo,
which had moved to `github.com/provectus-barhopping/hops-infra` (plus `core-infra`, the platform repo
I spent probes looking for on GitLab). Vladyslav: "forget about gitlab, we fully moved to github."

**Rule:** before surveying any repository named by a pointer (README, comment, remote-state key),
enumerate the org's actual repository list on the primary code host (`gh repo list <org>`) and take
the freshest copy by last-activity date. A pointer is a claim about the past; the org listing is the
present. One command, before the first read.

## 2026-09-04 — Drafted the report's structure without asking the reader first

The draft's six control groups, the layer-by-layer HOPS tab and the roadmap table were my own
choices; Vladyslav wanted five groups (data + workload merged), a per-repo percentage in the
implementation tab, and roadmap rows written as defined tasks with a "why". All three were
structural, so the rewrite touches every tab.

**Rule:** for a report a reader has opinions about, put the skeleton in front of them before writing
prose — the group names, what each tab's headline number is, and the row shape of the roadmap — as a
five-line question, not a 70 KB draft. Content is cheap to rewrite; structure is not.

## 2026-09-04 — Scored the project down for controls the IT department already owns

I reported "zero CloudTrail/GuardDuty/Config in code" and put "enable MFA on the root user" at the top
of the act-this-week list. Vladyslav: "all users log in via SSO and assume role. AWS org is managed by
it dep. Cloudtrail should be enable, but maybe manually via UI, not terraform." Checking took four
read-only calls: the account is a **member** of an IT-run organization, CloudTrail is two properly
configured *organization* trails, AWS Config comes from an org StackSet, and the trail Prowler flagged
is a leftover local test trail. Root has no access keys and nobody logs in with it. Two controls I had
scored 0 were partly satisfied, and the loudest task on my list was not the project's to do.

**Rule:** before scoring any *account-level* control against a project, establish who owns the account.
Run `organizations describe-organization`, and for anything the scanner flags at account level check
whether the resource is org-managed (`IsOrganizationTrail`, StackSet-named recorders, delegated
administrators) before calling it absent. In a member account, "not declared in this repo" is often
correct rather than a gap — and a task nobody in the room can perform discredits the ones they can.
Where the answer is not visible from a member account (service control policies return AccessDenied),
say so rather than reporting absence.
