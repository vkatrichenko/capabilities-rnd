# Methodology log

Running record of how this research is conducted. One entry per work session or major step.
Dead ends are recorded too — they are part of the method.

---

## 2026-08-14 — Workspace init and target survey

**Goal.** Make the repo agent-ready; establish what the research target actually is.

**Method.** Read-only filesystem + git survey of `~/Documents/internal-projects/BarHopping/`
(directory listings, `git log`/`remote`, grep of CI configs for scanner names, `.claude/` and
`.awos/` inventory). No scanners run yet.

**Findings that shaped the plan.**
- `BarHopping/` is a container of four independent repos (`hops`, `barley`, `hops-mcp`,
  `sowinsights`), not one repo. Scope was widened from `hops` alone to all four (read-only).
- The AWOS audit results assumed to need requesting were already in-repo:
  `hops/context/audits/` (5 runs) and `barley/context/audits/` (3 runs).
- `hops` already has a real security baseline (gitleaks CI gate, advisory pre-commit, agent-time
  secret hook). Phase 1 is therefore inventory-and-gap, not first-scan.

**Decision.** Comparison across the four repos becomes a first-class research question:
does security tooling correlate with AI-assistance level, or does it grow ad hoc per repo?

---

## 2026-08-14 — Phase 1a: cross-repo secret scan

**Tool.** gitleaks **v8.24.3** — deliberately the same version as the `hops` CI gate
(`.github/workflows/hops-mr-check.yml` downloads 8.24.3), so results are directly comparable with
what their enforcement layer would see. Standalone darwin_arm64 binary downloaded to the session
scratchpad — no global install, nothing added to any repo.

**Scan design.**
- `gitleaks git <repo>` — full git history, all four repos, **default config** for every repo.
  Rationale: cross-repo comparability requires the same ruleset; per-repo tuned configs would make
  the numbers incomparable.
- Secondary run: `gitleaks dir hops --config hops/.gitleaks.toml` (working tree, their tuned
  config) — measures what their own gate sees today.
- Non-mutating throughout: gitleaks only reads; no repo file was touched (verified via
  `git status` on all four before and after).
- Raw JSON reports → `scratch/` (gitignored, never committed). Everything that leaves `scratch/`
  is redacted: rule + file + date + first 4–6 chars + length, never the value.

**Triage method (scripted, so it is repeatable).**
1. Dedupe on `(file, secret)` — gitleaks reports the same secret once per commit touching it.
2. Classify **IN-HEAD** vs **history-only**: `git show HEAD:<file>` and test whether the secret
   string is still present. History-only leaks still matter (anyone with clone access has them)
   but the remediation differs: rotate vs rotate-and-remove.
3. Split by confidence: **high-confidence-format rules** (slack `xoxb-`/`xapp-`/`xoxp-`,
   `gitlab-rrt` `GR1348941…`, AWS `ASIA…`, `private-key` PEM blocks) can't match by accident;
   `generic-api-key` and `linkedin-client-*` are loose regexes needing manual review.
4. Manual review of every in-HEAD and every high-confidence finding, with values masked in all
   output — the triage script prints context lines with the secret replaced by a mask.

**Explicit non-step.** No found credential was tested for validity — verifying liveness means
using the credential, which is out of bounds. Rotation decisions belong to the repo owners.

**Results.** See `research/findings/secret-scan-2026-08-14.md`. Headline: raw counts are
dominated by false positives (barley 3,934 raw → ~22 real-format candidates), which is itself a
finding about scanner noise; and the only repo with a gitleaks gate (`hops`) is also the only one
whose worktree scans clean under its own config.

**Also collected in the same pass** (filesystem/git only, no scanners): lockfile and pinning
posture per repo; AI-assistance surface per repo (`.claude/` agents/skills/commands, hooks in
`settings.json`, MCP servers in `.mcp.json`). See
`research/baseline/cross-repo-matrix.md`.

---

## 2026-08-14 — Phase 1b: hops audit deep pass

**Goal.** Mine the AWOS audit runs; verify what the numbers actually mean; produce the verified
hops baseline.

**Method.**
1. Inspected one check object in full before aggregating — which exposed that the JSON `score`
   field is a raw weight sum, not a percent. Recomputed health as awarded/applicable-max per
   dimension and cross-checked against `report.md`'s own table (it headlines coverage %).
2. Extracted all FAIL/WARN/SKIP checks (with `applies` flag and evidence arrays) from the four
   security dimensions of the `2026-08-03` run; diffed statuses against `2026-07-17`.
3. **Audited the audit**: for each surprising verdict, checked the repo directly —
   `git ls-files` for `.env.example` (AS-13), hook locations vs the detector's assumed path
   (AIS-03), lockfile inventory vs SCS-01 evidence, `git log --diff-filter=A` to date
   remediations (`.gitleaks.toml` → 2026-07-30, 13 days after the failing audit).
4. Older runs (03-31/04-21/04-22): confirmed different schema + check set; excluded from numeric
   comparison by design.

**Corrections this pass forced** (recorded in `tasks/lessons.md`): the raw-score-as-percent
misread, and a false "hop-ui has no lockfile" claim (grep pattern lacked `pnpm-lock.yaml`).
Both had already leaked into CLAUDE.md / the 1a summary; fixed everywhere.

**Dead end worth recording:** none of the older markdown runs contain the AI-security
dimensions at all — a trend line for `ai-security` before 2026-07 cannot be constructed from
in-repo data.

**Outputs.** `research/findings/hops-audit-analysis.md` (open items, remediation loop with dated
commits, three audit blind spots), `research/baseline/hops-security-baseline.md` (5 layers,
claims-vs-catches).

---

## 2026-08-14 — Phase 1c: satellite repos (barley, hops-mcp, sowinsights)

**Goal.** Lighter pass on the three non-target repos; close the open question from 1a (why did
scrubbed cassettes still leak a token?).

**Method.**
1. Read barley's own `context/audits/2026-06-03/security.md` before re-deriving anything — it
   already held a critical side finding (live credentials in local `.claude/settings.local.json`
   allow-patterns) that filesystem scanning of *tracked* files can never see.
2. Root-caused the 1a cassette leak by reading the control, not just the leak:
   `tests/integration/conftest.py` → `filter_headers` (good) vs `_scrub_text` key-denylist
   (fail-open). Located the token's position in the cassette (`"runners_token"` response field)
   with a script that prints surrounding context but never the value.
3. Audited each `.mcp.json` (all four repos) as an execution surface: launch command + version
   pin state per server. This produced the cross-repo unpinned-MCP pattern.
4. hops-mcp/sowinsights: placeholder checks on env templates (masked output), `child_process`/
   `eval` grep, Dockerfile base-image pin state.

**Cross-validation note.** barley's audit SEC-04 ("no committed secrets", PASS) contradicts the
1a gitleaks findings — resolved in gitleaks' favor: SEC-04's grep excluded `tests/`, where the
tokens sit. Second instance (after hops AS-13/AIS-03) of audit detector scoping producing a
false verdict; now a systemic finding.

**Outputs.** `research/findings/satellite-repos-1c.md`. Rotation list extended (barley local
settings credentials). Phase 2 backlog gained the MCP-pinning check and the fail-closed
scrubbing pattern.

---

## 2026-08-14 — Phase 1d: external sources

**Goal.** Review the Anthropic security article named in the charter; queue the Dasha
confirmation.

**Method.** Web search resolved the charter's informal name ("Future of Engineering" article) to
the actual piece: *How Anthropic secures its AI-native software development lifecycle*
(claude.com/blog, Deputy CISO). Extracted practices per SDLC stage, then — the useful step —
built a practice→BarHopping mapping table against the verified Phase 1a–c state, so each
practice lands as either "exists here", "transferable action", or "out of scope with reason".

**Correction caught during mapping:** claimed hops has a `/security-review` command from a 1a
history sighting — at HEAD it does not (added, then reverted with an unrelated merge; only the
`security-guidance` plugin is enabled). Verified with `git log --follow --diff-filter=AD`.
Reinforces the existing lesson: history sightings are not HEAD facts.

**Human dependency.** Dasha confirmation (audit material outside repos; read-only scope over the
three sibling repos) — drafted ready-to-send in `tasks/todo.md`; blocked on a human, not on
research.

**Outputs.** `research/sources/anthropic-ai-native-sdlc-security.md`. Phase 1 research legs
(1a–1d) complete; 1e (HTML report) unblocked except for the Dasha answer, which gates nothing in
the report itself.

---

## 2026-08-14 — Phase 1d extension: broader source sweep (user-requested)

**Goal.** Collect additional SDLC-security sources beyond the Anthropic article — more
approaches/options for increasing security.

**Method.** Six parallel targeted web searches, one per angle: slopsquatting/package
hallucination, MCP security, NIST/OWASP frameworks, AI-generated-code vulnerability studies,
secret-scanning tool landscape, supply-chain frameworks + dependency cooldowns. Search-level
extraction only — sources needing a deep read before citation are marked ★ in the output file
and queued in `tasks/todo.md`. Each source recorded with the *control option it yields* and its
fit to the verified Phase 1a–c state, not as a raw link list.

**Cross-validation wins.** Two sweep results land directly on Phase 1 findings: dependency
cooldowns (pnpm `minimumReleaseAge`, default since v11) close the hops audit's SKIPped SCS-04
for one line of config; the CSA/OWASP-agentic MCP guidance (pin versions, watch tool-description
changes) independently validates the 1c unpinned-MCP finding and gives it a citation trail.

**Outputs.** `research/sources/sdlc-security-landscape.md` with a cost-ranked Phase 2 options
shortlist.

---

## 2026-08-14 — Phase 1e: Phase 1 report

**Goal.** Team-facing HTML presentation of Phase 1: what exists / what is missing / what to
implement. Doubles as the Monday 2026-08-18 progress answer.

**Method.** Built only after 1a–1d completed, entirely from the committed research files — the
report cites no number that lacks a file behind it. Redaction standard identical to the findings
files (masked prefixes, no values). Self-contained HTML (inline CSS, no external requests,
light/dark/print), kept as a **local file** in `artifacts/` — deliberately not published to any
external service per the internal-only constraint. Render-verified in both themes with headless
Chrome screenshots; one layout defect (bar-label collision at 100% width) caught and fixed in
that pass.

**Outputs.** `artifacts/phase1-report.html`. Phase 1 closed.

---

## 2026-08-14 — Phase 2 planning

**Trigger.** Phase 1 report approved by managers; report restructured into a six-tab artifact
and shared (roadmap table split into why-it-matters / how-it-fixes-it, benchmark sources
linked).

**Plan shape.** The approved 12-item roadmap converted into an executable checklist in
`tasks/todo.md`: Gate 0 (human messages + measurement baselines captured *before* the first
change), Wave 1 (four config-level PRs), Wave 2 (three portable tools, built and self-tested in
`tooling/` before gating anything in hops), a measurement checkpoint (audit re-run = the
before/after evidence), Wave 3 (medium items incl. the flagship hallucinated-package check),
plus owner recommendations kept explicitly out of our change scope.

**Process decision.** Small direct PRs per item, each citing the audit-check ID — the same
pattern the gitleaks gate used — rather than a full AWOS spec cycle; courtesy heads-up to the
HOPS tech lead in the first PR. Execution is deliberately item-by-item on explicit go, nothing
started at planning time.

---

## 2026-08-18 — Phase 2 Gate 0

**Goal.** Capture the before-state and clear the human asks *before* the first `hops` change —
once W1.1 merges the baseline is unrecoverable.

**Method.** Two of the four Gate 0 items are messages only the researcher can send; both drafts
were written into `tasks/todo.md` next to the item they close (G0.1 barley rotation ask, G0.2
Dasha scope confirmation) so the text sent is on record, redacted to the findings-file standard.
The before-state note was built link-only — no re-measurement — from the Phase 1 files, plus a
re-read of the 2026-08-03 audit JSON to pin the exact per-check weights the checkpoint will be
compared against.

**Blocker found.** The OpenSSF Scorecard baseline (G0.3) cannot run: both `gh` accounts are
refused by `provectus-barhopping` SAML SSO — `vkatrichenko` gets "Resource protected by
organization SAML enforcement", `vkatrychenko` gets 404. Git over SSH works (that is how the
repos are cloned); the REST/GraphQL API does not, and Scorecard needs it. Unblocking is a
one-time browser authorization. Recorded rather than worked around, because the local-mode
fallback degrades exactly the checks (branch protection, code review) that make the baseline
worth having.

**Three corrections to the approved plan** — the reason to re-read the audit JSON rather than
trust the Phase 1 summary of it:

1. **W1.1 cannot "close SCS-04".** SCS-04 is `SKIP`/`applies:false`: its own evidence says
   quarantine age "requires live registry API calls" and is "intentionally skipped by the static
   detector". A re-run will skip it again. The cooldown still has merit, but its evidence has to
   be a local reproduction, not a score delta.
2. **The planned window is below AWOS's own bar.** SCS-04 is calibrated at 7 days (`10080`);
   the plan said `1440`. Now an explicit decision rather than a copied default.
3. **The `.claude/hooks/` path assumption costs hops twice.** Phase 1 found the AIS-03 phantom
   skip; the same root cause also **FAILs ADP-04 (0/5)** for hooks that exist. That produced a new
   Wave-1 item (W1.5, hook relocation) — the cheapest item in the wave and, unlike W1.1, one with
   a real before/after number. It also widened W2.2: 3 of hops' 4 hooks exist only as inline
   `command` strings in `.claude/settings.json`.

**Method note.** The general lesson is the one already in `tasks/lessons.md` about metric
semantics, applied one level deeper: a check's *status* needs reading as carefully as its score.
`SKIP` and `FAIL` are not interchangeable — one means "not measured", the other "measured and
absent" — and a plan that treats a skipped check as a closeable gap promises a delta that cannot
appear.

**Outputs.** `research/baseline/phase2-before-state.md`; Gate 0 and Wave 1 rewritten in
`tasks/todo.md`. G0.3 open (SSO), G0.1/G0.2 pending send.

---

## 2026-08-18 — Phase 2 Gate 0 (continued): Scorecard baseline

**Unblocking.** The SAML SSO 403 was on the GitHub CLI's OAuth token, not the SSH key — the key
was already authorized, which is why git worked and the API did not. Two things that did *not*
work: the `authorization_request` URL returned in the 403 header, and the OAuth-app page's
org-access ✓ (that is an app-level grant, a different object from the per-token SAML grant).
What worked was re-running `gh auth login --web` and completing the device-code flow, which
performs the SSO handshake inline. Worth recording because the error message points at the URL
that does not fix it.

**Method.** Scorecard v5.1.1-45-g40bbc9c9, image pinned by digest, full remote mode with
`--show-details`, run twice — the first run without details, which turned out to be useless
(scores with no evidence). Raw JSON to `scratch/`; the artifact carries the digest and the
scanned commit so the run is reproducible.

**Verification discipline.** Two Scorecard claims were checked against GitHub directly rather
than reported as-is, because both would have been headline statements:

- *"branch protection is not maximal"* → confirmed from two independent endpoints
  (`/rules/branches/main` and `/branches/main`), because Scorecard's branch-protection read
  degrades silently without admin and we do not have admin. Both agree: `main` requires a PR and
  1 approval and **zero passing status checks**.
- *"SAST tool is not run on all commits"* → **rejected.** hops runs a self-hosted SonarQube MR
  scan; Scorecard detects CodeQL and hosted SonarCloud only. Recorded as a false negative so W2.3
  does not chase it.

**The finding that matters.** The secret-scan gitleaks gate — the control this whole capability
story rests on — does not block a merge. Then, searching all 13 AWOS dimensions for any
branch-protection or required-status-check concept: nothing. PRV-01/03/04/06 each assert a gate
**exists in CI**, never that it **blocks a merge**, so `prevention-coverage` 81.5% measures the
presence of prevention, not its force. Two audits, complementary blind spots — Scorecard has the
enforcement check AWOS lacks, AWOS has the agent-surface checks Scorecard lacks, and each misses
things the other catches on the same repo, in both directions.

Generalizable: **"the control exists" and "the control is enforced" are separate measurements,
and most audit tooling makes only the first.** That is a capability claim, not a HOPS one.

**Scope discipline.** Requiring the status check is a repository-settings change needing an
admin, so it is a recommendation to the HOPS tech lead, not a Phase 2 PR — logged under
"Recommendations to owners" rather than quietly widened into our change scope.

**Outputs.** `artifacts/scorecard-baseline-hops.md` (G0.3 closed);
`research/baseline/phase2-before-state.md` gained a fourth correction and the right pinned commit
(origin `f640dee9f` — the local clone was 5 days stale, which the note now says); W1.2 gained a
number (65 open advisories against a label-gated audit) and W1.4 gained the 17 unpinned
third-party actions.

---

## 2026-08-18 — barley rotation triage

**Trigger.** "Where are these tokens, what has to happen, does it need a PR, do I notify first?"
The Phase 1a scan said *what* leaked; none of it said what to *do*, and the counts turned out to
be the wrong unit.

**Method.** Re-verified against barley `2682dcb13` rather than the 2026-08-14 scan output. All
three in-HEAD files still present. Then the step the original scan skipped: **fingerprinting**.
Hashing each match (`sha256`, first 12 hex) turns a list of occurrences into a list of
*credentials* — the unit rotation actually operates on. Result: the "22 real-format credentials,
3 in HEAD" headline is 7 distinct credentials, 2 in HEAD, plus 3 low-entropy placeholders that
need nothing. Fingerprints also let owners match a token they hold without either side pasting a
value.

Then `git log -p` with add/remove tracking per fingerprint, for exposure windows — the input to
"do we need to read audit logs, and over what period". That corrected a date: the production
Slack tokens ran 2025-03-07 → **2026-07-22**, not 2025-07; they were removed last month by a
commit whose message announces the removal while the tokens stayed live.

**Operational catch.** `terraform/us-west-2/*/lambdas.tf` reads the Slack secret through a
`data` source and injects it as a **Lambda environment variable**, resolved at apply time. So
updating Secrets Manager does not rotate anything in a running Lambda — it takes a
`terraform apply` in dev and prod. Rotation is a coordinated deploy, not a console click, which
is most of why step 0 is "notify".

**Sequencing finding.** Rotate before cleanup, not after. A PR that removes a leaked credential
publishes a pointer to a still-valid one; `5c571dcf1` already did this once. And do not rewrite
history: ~8,000 commits and unknown forks, and once a credential is dead its presence in history
is an artifact. Rewriting without rotating fixes nothing while looking like it did.

**Scope discipline.** barley is read-only here, so the deliverable is a runbook for its owners,
not a change. No credential was tested for validity — that means using it — so every "is it
live?" is stated as an owner-side check.

**Outputs.** `research/findings/barley-rotation-runbook.md`; G0.1 now ships with it attached.

---

## 2026-08-18 — Wave 1 item W1.1: pnpm cooldown

**Trigger.** First actual change of Phase 2. Chosen over "port the gitleaks gate", which is a
`barley` change and therefore out of our approved scope.

**What investigation changed.** The approved item was one line: `minimumReleaseAge: 1440` in
`hop-ui`. Checking the toolchain before writing it showed the line would do nothing — CI installs
pnpm unpinned, which today resolves to pnpm 11, and pnpm 11 already defaults that setting to 1440,
while the Dockerfile pinned `pnpm@9`, which predates it. CI had the control by accident and the
image build did not have it at all. The defect was the float, not the missing line.

Two more controls turned out to be silently dead, both from pnpm 11 relocating configuration:
`.npmrc`'s `save-prefix` (the exact-pinning control the audit credits under R5/SCS-03) and
`package.json`'s `pnpm.onlyBuiltDependencies`. pnpm announces the second on every install; nobody
was reading the output. The repo was half-migrated — `pnpm-workspace.yaml` already carried the
replacement `allowBuilds` while `package.json` kept the removed field.

**Generalizable: a version-floating toolchain silently relocates your controls.** A major bump
does not announce that a setting stopped being read — the file keeps existing, the setting keeps
looking set, and the guarantee is gone. Neither audit checks whether a configured control is
still *read* by the tool that is supposed to enforce it. That is a third variant of the pattern
this capability keeps hitting: exists / enforced / **still wired up**.

**The near-miss.** The Dockerfile `dependencies` stage copied `package.json` and `pnpm-lock.yaml`
but never `pnpm-workspace.yaml`, so the image build had been depending on the very field being
removed. Reproduced the failure deliberately (`ERR_PNPM_IGNORED_BUILDS` for `@swc/core` and
`core-js`) with the fix as a control, rather than reasoning about it. Second generalizable form:
**a config file not copied into the build context is a control that does not exist there.**

**Verification.** 13 checks in clean containers on the image the Dockerfile actually uses,
including both Docker stages end to end. The cooldown was proven, not asserted: a package version
published 20 hours earlier was refused, with a `minimumReleaseAge: 0` run installing the same
version as the control — the control is what makes it evidence rather than a coincidence. Gap
reported rather than glossed: `test:coverage` exceeded the time budget under amd64 emulation.

**Audit position stated up front.** This does not close SCS-04 and no re-run will show it —
SKIP-by-design. The refused install is the substitute, and is better evidence than a score would
have been.

**Outputs.** `hops` commit `ccfc77828` on `HOP-0000/pnpm-toolchain-pin-and-cooldown`, unpushed;
`artifacts/w1-1-pnpm-cooldown-evidence.md`.

---

## 2026-08-19 — W1.1 test verification: a red run that was not a finding

**What happened.** The `hop-ui` suite failed 60 of 4419 tests on the W1.1 branch. Taken at face
value that is a regression and the change does not ship.

**What settled it.** Running the *unmodified* `origin/main` tree through the identical container,
image and pnpm version — the control that turns a number into evidence. Baseline: 4 failed. Then
the branch again on an idle machine: **4 failed / 4415 passed, identical to baseline.** The
60-failure run was contention — every failure a `Test timed out in 5000ms`, no module-resolution
or pnpm error anywhere in it, and 1093s against 395s for the same work.

**Method note.** Two process failures on the way, both worth recording because both cost a full
run. First, filtering test output through `grep` *before* stripping ANSI escapes, which silently
matched nothing and produced an empty log after ~15 minutes of compute. Second, capturing only
`tail -25` of the first run, which lost the failure list exactly when it was needed for
comparison. Rule taken: **write the raw log to a file first, filter afterwards** — a filtered
stream is not a record, and long runs are not cheap to repeat.

**Rule taken on the result itself.** A single red run is not a finding. Before attributing any
test failure to a change, run the unmodified tree under the same conditions — "looks
environmental" and "is environmental" are separated by exactly one control run, and the difference
here was between shipping and not shipping.

**Side finding for the HOPS team.** `origin/main` does not pass its own suite: 4 tests in
`create-hubspot-deal/.../create-deal-stage.test.tsx` fail on timeout in a container-speed
environment, on both trees. That is consistent with the Gate 0 finding that `main` requires zero
passing status checks — a suite nothing gates on is a suite that drifts red without anyone
noticing.

**Outcome.** W1.1 verification complete: 13 of 13 checks pass, no regression. `hops` commit
`ccfc77828` still unpushed pending branch-name and push decisions.

---

## 2026-08-19 — W1.1 in CI: the pipeline around the change was the finding

**Trigger.** PR #515 opened on hops; one check red, review comments to read.

**The red check** was trivial — `Spec link – PR template` requires the template's `**Spec:**`
field to hold either a `context/spec/...` path or `n/a — <reason>` of at least ten characters,
and it was empty. Filled in with the reason, re-ran green. Worth noting the check exists at all:
it is a small deterministic gate on PR *hygiene*, the same shape as the controls this research
argues for, and it caught a real omission on the first try.

**The review comments** were the second finding: there weren't any. CodeRabbit returned a
walkthrough and a merge-risk estimate and stated it had produced no line-by-line review because
the organization has reached its developer-seat limit. `.coderabbit.yaml` is credited in the
Phase 1 report as an implemented AI-code-review control. On current licensing it is not
performing one, and because a seat limit is not a code change, **nothing in the repo records
that the control is inactive.**

**The larger finding** came from reading the skipped jobs rather than the failed one. Three of
the four quality and security gates did not run: `unit-tests-hops-fe` and `osv-audit-hop-ui`
gate on a `frontend` label, `sonarqube-check-mr` on `frontend` or `backend`. This PR carried
`dependencies`. So a change that rewrites hop-ui's package manager, its build image and three
workflows ran **no frontend tests, no SAST and no dependency audit** — only gitleaks, the one
unconditional job.

Phase 1 recorded the osv job as label-gated and stopped there. Looking at what *skipped* rather
than what failed showed the same condition on two more jobs.

**How it composes.** Gate 0 established that `main` requires zero passing status checks. This
establishes that most checks do not run unless someone labels the PR. Together: the gates are
**skippable by omission** and **non-binding at merge**, and neither fact appears in any audit
score, because `prevention-coverage` asks only whether a gate exists in CI.

That is now four variants of one capability claim: a control can exist, and still not be
**enforced** (Gate 0), not be **wired up** (W1.1's relocated pnpm settings), not be **triggered**
(this), or not be **licensed** (CodeRabbit). Every one of them reads as PASS to an audit that
checks for presence.

**Method note.** The instinct on a red pipeline is to read the failure. The failure here was
housekeeping; the finding was in the twenty jobs marked "skipping", which is the part of a CI
run nobody reads. Rule taken: **on any pipeline run, read what skipped, not just what failed.**

**Outputs.** PR #515 body fixed and all checks green; findings appended to
`artifacts/w1-1-pnpm-cooldown-evidence.md`; W1.2 scope widened in `tasks/todo.md`; CodeRabbit
seat limit added as an owner question.

## 2026-08-19 — PR #515 re-checked after labelling

Re-read the PR's check rollup rather than trusting the earlier snapshot. A reviewer had added the
`frontend` and `dependencies` labels, so the three label-gated jobs (`unit-tests-hops-fe`,
`sonarqube-check-mr`, `Security audit – hop-ui`) plus `check-hop-fe-docker` ran, all green — run
`32236885046`. Read the job list of that specific run, not the aggregated rollup, because the
rollup carries both the SKIPPED entries from the pre-label runs and the SUCCESS entries from the
post-label one under the same job names; the aggregate view is unreadable for this question.

Two consequences recorded in `artifacts/w1-1-pnpm-cooldown-evidence.md`: the Dockerfile fix is now
CI-proven, and the 4 local `test:coverage` failures are local-environment artefacts, since CI runs
the identical command green. The W1.2 finding stands — the gates ran because a human labelled the
PR, which is the failure mode, not the refutation.

## 2026-08-19 — Porting the gitleaks gate to barley; a gate that hid secrets

Goal: turn the "port the hops gitleaks gate" recommendation from a pointer into
an applyable change. Method was measure-first: the number that decides whether a
team adopts a secret-scan gate is its day-one finding count, so that was
established before any config was written.

Sequence and what came back:

1. Fetched gitleaks 8.24.3 (the version the hops CI job pins) and verified the
   darwin binary against the release checksums file — which also confirmed the
   linux sha256 that the hops workflow hardcodes.
2. Full working-tree scan of barley, default ruleset: **110 findings**. Triaged
   every one by rule and file, then classified the ambiguous ones without
   printing values (length, character class, sha256 fingerprint, whether the
   value is placeholder-shaped). 6 real, 104 false positives.
3. **Caught the clone being 229 commits stale** only when branching from
   `origin/develop` for the PR. Re-ran the entire triage against develop:
   **89 findings**, and the 3 `gitlab-rrt` cassette tokens were gone — the
   cassettes had been regenerated and scrubbed in the intervening commits. The
   rotation ask is unchanged (they remain in history), but the HEAD claim in the
   earlier findings file was out of date. Second time a stale clone has produced
   a wrong number; see `tasks/lessons.md`.
4. Writing the config surfaced the real finding. The first draft used
   `regexTarget = "line"` (copied from hops) and the tuned scan came back with
   the real `gitlab-rrt` tokens **missing**. Bisecting the config showed the
   suppression was not caused by any regex — a regex matching nothing suppressed
   them too. Isolated to the `regexTarget` setting itself, reproduced on both
   repos, and then shown to hide a deliberately planted credential in hops.
   Written up in `artifacts/gitleaks-allowlist-scope-finding.md`.
5. Attribution pass: every one of the 86 suppressed findings mapped to a named
   config entry. Two entries matched nothing on develop and were deleted rather
   than shipped — a security config full of unverifiable entries is how the next
   person loses confidence in it.
6. Negative control: synthetic credentials planted inside three allowlisted
   contexts, all still detected. One early plant was NOT detected and looked like
   over-suppression; it was low entropy, and a higher-entropy synthetic was caught.
   Recording that because it is exactly how a control gets wrongly marked broken.
7. Positive control on the real CI command: throwaway commit with a synthetic AWS
   key, `gitleaks detect --log-opts merge-base..HEAD` exits 1. Pre-commit hook
   fired on the same value and passed on an ordinary change.

Method note worth keeping: the sequence that found the defect was *triage before
config*, not *config then triage*. Writing the allowlist first and checking the
count afterwards would have shown 6 findings suppressed to 3 and read as success.

## 2026-08-19 — Phase 2 delivery status, and a correction that had not propagated

PR #515 (pnpm toolchain pin + dependency cooldown) merged to hops `main`. The barley gate and the
hops allowlist-scope fix are open as #1636 and #518, both green.

Two process notes worth keeping:

**The barley PR was opened against the wrong base first.** #1634 targeted `main` while the branch
was cut from `develop`, so it showed 13 commits and 25 files instead of 1 and 4. Closed and
reopened as #1636 against `develop`. The underlying cause is that the two repos have opposite
conventions — barley merges features to `develop` (22 of the last 25 PRs) with both branches
auto-deploying to separate AWS environments, while hops merges straight to `main` and its
`develop` branch is a month stale with a failing deploy pipeline still pointed at it. Nothing in
either repo states which model it follows; it is only visible in merge history.

**Updating the report surfaced a correction that had never propagated.** The 2026-08-18 rotation
runbook established that barley's "22 credentials" was a count of occurrences across commits, not
distinct values — the real figure is 7. That correction lived only in the runbook. The report,
which is the artifact managers actually read, still carried 22 in its headline KPI, its manager
summary, its thesis callout, its bar chart and two roadmap rows. Fixed in all six places.

The rule this earns: a correction is not landed when the file that owns it is fixed. Grep every
derived artifact for the old number at the moment the correction is made. Added to
`tasks/lessons.md`.

## 2026-08-19 — W3.1 hallucinated-package check: design, tool, and two honest measurements

Built the slopsquatting check while the three PRs sat in review. Sequence per the approved plan:
design → `tooling/ci/` with self-tests → hops PR (not yet taken).

The method that mattered was measuring the false-positive rate before fixing the thresholds, on
real data, twice.

**First measurement, discarded as flattering.** Replaying the check over 40 historical
`hop-ui/package.json` commits judged each added package's age against *today*. A package that was
30 days old when it was added looks 500 days old now, so the replay could only ever produce a low
false-positive rate. Redone evaluating each package as of its own commit date. The answer held —
0 of 28 — but the first number was not evidence and the second one is.

**The thresholds are derived from the repo, not chosen.** The 90-day age floor sits far below
hops' real distribution (youngest direct dependency 298 days, p10 1238). The 8-character floor on
the near-neighbour rule exists because without it hops' own manifest self-reports two false
positives (`clsx`↔`tsx`, `vite`↔`vitest`) — short names make edit distance 2 meaningless. Writing
the floor down as a measured constant, with the limitation it creates (`clsx`→`clsxx` is missed)
stated in the design note, is the difference between a tuned rule and an arbitrary one.

**The first false positive was found by running the tool on real data, not by reasoning.** hops
depends on two `link:` local eslint plugins that do not exist on npm. A check that reads dependency
names without reading their specifiers reports 2 hallucinated packages in a healthy manifest on
its first run. That single case shaped the whole specifier-gate rule.

**A side probe worth recording as a negative result.** 273 single-edit variants of hops' 8
most-used dependencies were checked against npm; exactly one is registered, and it is a legitimate
2017 package. The typosquat surface around hops' top dependencies is empty today. Reporting that
plainly matters — it would have been easy to present the near-neighbour rule as if it had found
something.

**Tooling note.** A replay loop silently produced zero results for several iterations because zsh
applied its `:h` history modifier to `$cm:hop-ui/package.json`. Braces (`${cm}:...`) fix it. Logged
in `tasks/lessons.md`; the failure mode is silent and looks like "no data" rather than an error.

## 2026-08-20 — Three of four PRs merged; report re-cut by delivery state

barley #1636 (secret-scan gate) and hops #518 (gitleaks allowlist scope) both merged this morning,
joining hops #515. hops #528 (hallucinated-package check) is still open with no reviewer assigned
after 18 hours.

Report change requested and made: the roadmap table now colours the **whole row** by delivery
state rather than appending a status chip to one cell — merged rows sage-tinted with a left rail,
in-review rows slate, untouched rows unchanged, with a legend. The distinction matters for the
audience: a chip is read as an annotation on a plan, a coloured row is read as a plan that is
being executed.

One precision call worth recording. Roadmap item 2 reads "Port the hops gitleaks gate —
barley, hops-mcp, sowinsights (rec.)". Only barley shipped. The row is marked done because the
actionable part is complete, and the "Where" cell now says so explicitly rather than letting green
imply all three repos are covered. Marking a row green when a third of its scope landed would be
exactly the kind of overstatement this research keeps finding in other people's dashboards.

## 2026-08-20 — Fail-closed cassette scrubbing (roadmap item 8)

The pattern, not the patch, is the deliverable here — so the method was to establish what a
generic rule would break *before* writing one.

**Measured the over-redaction risk first.** Candidate rules were run over all 73 committed
cassettes as a probe, with no code written into barley. A key-shape rule matched exactly two
things: `SecretId` (an identifier, not a secret) and, correctly skipped, two pagination cursors.
A value-shape rule matched nothing at all. That result decided the design: both passes could be
added with zero change to existing fixtures, and the two exclusions — cursors and identifiers —
are the ones the data said were needed, not the ones that seemed plausible.

**Confirmed additivity rather than assuming it.** The finished passes were applied to all 73
cassettes and diffed: 0 files change. That is what makes this safe to merge without re-recording,
and it is a claim worth proving rather than asserting, since re-recording needs live credentials
and would have made this an owner task instead of ours.

**The enforcement test is the actual capability.** Two generic passes are still a denylist with a
wider net; what makes the design fail closed is a test that reads the cassettes *as committed*
rather than trusting the scrubber. Verified both directions: 0 offenders on the real repository,
and a planted Slack token in a copied tree does fail it — reporting file, line and pattern, never
the value. It also asserts it found cassettes at all, because a clean scan of an empty directory
is the classic way this kind of check silently stops working.

**Could not run barley's pytest.** Local Poetry rejects the repo's `include-groups` config. The
scrubbing functions are pure text-to-text, so they were extracted and exercised directly — 13
behavioural checks plus the cassette corpus. Stated as a limitation in the PR rather than papered
over: CI running the suite is the real check.

## 2026-08-20 (later) — Item 8 in review; the control turns out to be conditional

barley PR #1652 open, base `develop`, **their full suite green** — which closes the caveat that
barley's pytest could not be run locally. The scrubbing functions behaved in CI exactly as they did
in the extracted harness.

Two things worth keeping from this one.

**Asked "why only barley?" and checked instead of reasoning.** The roadmap scoped item 8 to barley
without saying why, and the honest answer was not in the roadmap. hops records no API traffic at
all: no VCR, no cassettes, no `nock` recorder, and WireMock is "deliberately not on the classpath"
per hops' own test comment — it stubs at the repository interface, so no response body is ever
written to disk. Running barley's credential patterns over 2,537 hops test and fixture files
returned zero. So the control attaches to a **testing practice**, not to a repository or a
language. That reframes the blueprint entry: the question a new project must answer is not "what
stack is this?" but "does it record real responses into committed files?" Copying the scrubber into
hops would add maintained code that can never fire — a cost with no benefit, and the kind of thing
a checklist-shaped blueprint produces if the conditionality is not written down.

**Our own two controls collided, and the resolution is the pattern.** The fail-closed tests need
credentials that are genuinely issuer-shaped, or they cannot prove the value patterns work — and
the secret-scan gate merged four days earlier flagged them, correctly. It was resolved by weaving a
`NOTAREALTOKEN` marker inside the span each rule captures and stopwording that one string:
suppressed by value, never by path. Path-allowlisting the test directory would have been quicker
and would have recreated precisely the blind spot that made barley's own audit report a false PASS
on SEC-04. Worth recording because it is the first time a control this project added constrained
another control this project added, and the cheap fix was the wrong one.

## 2026-08-21 — All five Phase 2 pull requests merged

hops #528 (hallucinated-package check) and barley #1652 (fail-closed cassette scrubbing) merged
today, closing the review queue. Five PRs across two repositories in three days: roadmap items 2,
3, 6 and 8, plus the gitleaks allowlist-scope fix that was on no roadmap.

Worth stating plainly for the phase write-up: **the unplanned item is the most interesting one.**
Items 2, 3, 6 and 8 were all predicted by Phase 1 research — they were on the list before any code
was written. The allowlist-scope fix was not. It surfaced only because porting a control to a
second repository forced a line-by-line reading of a config that had been treated as settled, and
what it found was that the one security gate hops actually had was suppressing real findings.

The generalizable claim is about method, not about gitleaks: **porting a control is a stronger
audit of that control than reviewing it in place.** Reading `.gitleaks.toml` in hops produced
nothing for two phases; re-implementing its intent somewhere else exposed the defect within hours.
That belongs in the methodology section of the article as a technique, not as an anecdote.

Report republished with every delivery row green. Next: the measurement checkpoint (re-run the
AWOS audit) — but note that of the merged items only W1.5, still unshipped, produces a large audit
delta. The checkpoint will under-report the phase unless that is said explicitly.

## 2026-08-23 — W2.3: Scorecard in CI, and a delta of zero

Two runs of Scorecard v5.5.0 against `hops` (current `main`, and the Gate 0 commit via `--commit`),
three more against the sibling repos, a Node comparison tool with 22 offline self-tests, and a hops
branch that is committed and unpushed. Full evidence: `artifacts/scorecard-w2-3-evidence.md`.

**The result is a negative one, and it is the point.** Not one check moved between the 2026-08-18
baseline and today, across three merged security PRs. Scorecard has no secret-scanning check, no
concept of a dependency cooldown, and no opinion about whether a package name exists — so #515,
#518 and #528 are invisible to it by construction. Reporting that plainly is more useful than
finding something to claim: the pairing of AWOS (does the control exist?) with Scorecard (is it
enforced?) only earns its keep if we also say what neither of them sees.

**Method note — the version-matched re-baseline was worth the extra run, and not for its result.**
The baseline was captured at v5.1.1-45 and CI will run v5.5.0, so a raw before/after would confuse
tool drift with repository change. Re-reading the *same commit* at the new version returned
identical scores, including an advisory count of 65 on both. That is a control that cost one command
and now lets the delta be stated without a caveat. The by-product mattered more: `--commit` silently
runs only **9 of 18** checks, and its aggregate (4.9) is computed over that subset. Comparing it
with 5.4 would have manufactured a regression out of nothing. A tool that quietly narrows its own
scope and still prints a headline number is exactly the failure mode this project keeps finding.

**A finding one layer below where anyone looks.** The workflow pins `ossf/scorecard-action` to a
commit SHA — and that action's own `action.yaml` runs `docker://ghcr.io/ossf/scorecard-action:v2.4.4`,
a mutable tag. The pin fixes which manifest is read, not which code executes. Found inside the tool
adopted to measure exactly this class of gap. Generalized for the article: **"pinned" is a claim
about one layer** — a SHA-pinned action, a digest-pinned image built `FROM` a tag, a lockfile whose
registry permits re-publication.

**The cross-repo table corrected a claim I was about to make.** All four repos score
Token-Permissions 0, and the obvious sentence — "none of them declares top-level workflow
permissions" — is false. `barley` declares them in 27 of 28 workflows and scores 0 anyway, on two
`contents: write` grants and one workflow with none. It is materially ahead of `hops` (which
declares none, anywhere) at an identical score, because the check is effectively a minimum over
workflows. The details field said so; the score did not. Caught only because the write-up was built
from the raw JSON rather than from the score table — which is now the rule for these artifacts.

Independent confirmations worth recording: Scorecard flagged `sowinsights`' committed `.pyc` files
and its mutable `python:3.11-bullseye` base image without being told to look, both Phase 1c
findings; and `barley`'s Code-Review 2 (2 of 9 changesets approved) is a third instrument agreeing
with the gitleaks history scan and barley's own audit about how that repo merges.

## 2026-08-23 (later) — the question that widened the measurement

Asked whether Scorecard should not cover every related repo rather than just `hops`. It should, and
the answer split cleanly in two: **measurement** is read-only and costs one command per repo, so it
went org-wide immediately; **the CI job** is a change, and changes need the owning team's approval,
which is why three sibling branches now sit committed and unpushed rather than merged.

**The scope question was the finding.** The charter names four repos. The org has 27. Sweeping all
of them turned an argued-from-`hops` claim into a verified org-level one: 25 of 26 default branches
require zero passing status checks, and the enterprise ruleset carries no `required_status_checks`
rule type at all. The top recommendation stopped being "ask the HOPS tech lead" and became "one
change to the `provectus-global` ruleset". Four repos was a scoping decision inherited from the
charter and never re-examined; re-examining it cost 25 minutes of wall-clock.

**Two score inversions in one day, both found the same way.** `barley` declares top-level workflow
permissions in 27 of 28 workflows and scores Token-Permissions 0; `hops` declares none anywhere and
also scores 0. `barley` is the only repo in the org that blocks a merge on a passing check and
scores Branch-Protection 4, below the 25 repos that block nothing. Both were caught by reading the
`details` field rather than the score, and both would have been asserted backwards from the score
table alone. **A per-check score is not monotone in the control it names** — the same lesson as the
Phase 1 AWOS `score`-vs-`coverage` correction, from a different tool, which is what makes it a
methodology claim rather than a quirk.

**Porting rule, stated because it was nearly got wrong: one policy, two implementations, chosen by
what each repo's own lint pipeline claims.** The instinct was to ship the Node checker everywhere.
But W3.1 ported Python → Node for `hops` precisely because hops CI has no Python; shipping Node into
`barley` and `sowinsights` is that mistake mirrored. So there is a stdlib Python twin, and an
agreement check that runs both implementations over every real Scorecard result under three baseline
mutations each — 15/15 byte-identical. Two implementations of one policy drift unless something
stops them.

**Running each repo's own gate found things reading its config did not.** `ruff format --check`
under barley's `pyproject.toml` rejected the first pass. `make check` in `hops-mcp`, after a full
`npm ci`, showed prettier claiming the new workflow YAML — while confirming that `scripts/` really
is outside eslint, prettier and tsconfig, which was the reason the Node twin was safe to put there.
Neither would have been caught by inspection. Cheap rule: before committing to someone else's repo,
run their gate, not your reading of it.

**And an unplanted test of our own fail-closed rule.** `dme-core` is an empty repo; Scorecard
returns `"checks": null` with aggregate -1. Both twins exit 2 on it rather than treating zero checks
as zero regressions. The degenerate input the tool was designed against turned up on the first
org-wide run without being constructed.

## 2026-08-24 — porting outward: `wort`, and what a stricter repo teaches

**The question was "should this go to all 27 repos?" and the honest answer was no.** The instinct
after building a control is to maximise its coverage. The org sweep already held the data to refuse
that: filter to *actively maintained* **and** *has CI* and 27 collapses to seven. Sixteen of
twenty-six repos score Maintained 0; eleven have no GitHub Actions workflows, so three of the six
gated checks would read `-1` there and the weekly job would measure very little at real cost. **A
control that cannot move is not a control** — for the dormant tail, the right artefact is a periodic
sweep run from one place, which is what the sweep already is.

There is a sequencing point underneath it, and it matters more than the coverage. 25 of 26 default
branches require zero passing status checks. A gating workflow added to a repo where no check is
required produces a red X that merges anyway. **Rolling out a gate before the org enforces gates is
decoration.** One ruleset change dominates twenty-odd repository PRs.

**Running someone else's linter is worth more the stricter they are.** `wort`'s `make lint` is
pyupgrade + bugbear + flake8-simplify + `E501` at 100 columns, plus repo-wide pyright — materially
stricter than `barley`'s `E,W,F,I` with `E501` ignored. It rejected the Python twin on four counts
(`.format()` over f-strings, `raise` without `from`, an `if`-block where `.get` reads, two long
strings). None of that is cosmetic in effect: the fix produced a file that is **format-stable at
both 99 and 100 columns**, so one source now satisfies two repos with different line lengths instead
of forking per repo. The generalizable form: *satisfy the strictest consumer and the others come
free; satisfy the loosest and you own a fork per repo.*

Held to it afterwards by re-running the agreement check — 15/15 byte-identical against the Node
twin, on five real results including `wort`'s. A rewrite that passes its own tests but silently
changes output is exactly what an agreement check exists to catch.

**Fresh approval is per-repository, and the tooling enforced it.** The user approved `wort`
explicitly. When the same rework was then copied toward `barley` and `sowinsights` — a strictly
mechanical propagation, behaviourally proven identical — the write was refused, correctly: those
repos were approved for their own port on a different day, not for edits today. So the two unpushed
sibling branches now carry a stale-but-equivalent revision, and that is recorded as known drift
rather than quietly fixed. **Proving two revisions equivalent is not the same as being allowed to
replace one with the other.**

**The sharpest declared-vs-enforced case in the org turned up here.** `wort`'s `main` requires a
pull request and one approving review; Scorecard reads 1 of 30 changesets approved, and branch
protection reports administrators exempt. Earlier instances of this finding were about a control
being *absent* (no required status checks). This one is a control that is *present, switched on, and
routed around* — a strictly stronger version of the same claim, and the better example for the
article.

**Third instance of the score non-monotonicity, and this time it names a one-line fix.** Three of
`wort`'s four workflows declare top-level `permissions`; `ci.yml` does not, and Token-Permissions
reads 0 for the repo. Adding `permissions: contents: read` to that one file moves the check 0 → 10.
It was deliberately left out of the port: it is a change to a CI job this research does not own, and
scope discipline is what keeps these ports acceptable to their owners. Named in the PR body instead.

**A gate that constrains its own author is a good sign.** `Pinned-Dependencies` is gated at 8, and
adding a workflow adds dependencies to the check being gated — so a tag-referenced action in the new
workflow would have failed the job on its first run. Worth noticing as a design property: the
controls worth shipping are the ones that apply to the change that ships them.

## 2026-08-25 — the first real run failed, and that was the most useful hour of the work item

`wort` #216 merged, the job fired, and it failed. Not a posture change: two of Scorecard's API calls
returned 403 under the default `GITHUB_TOKEN`, `CI-Tests` scored `-1` instead of 10, and the
comparison failed closed on it.

**The permission list came from upstream's README, and upstream's README is incomplete.** It
documents `contents`, `issues`, `pull-requests`, `checks` as the "recommended reads for private
repos". It omits `statuses: read` (which `CI-Tests` needs for `ListStatuses`) and `actions: read`
(which `Packaging` needs for `ListWorkflowRunsByFileName`). Following the documentation exactly
produced a job that could not measure two of its own checks. The methodology lesson is narrow and
useful: **for a tool that reads an API, the authority on required permissions is the failing call,
not the vendor's example block** — and the failing call is only observable in a real run. This was
listed as "not verifiable before merge" in the plan for a reason, and the reason held.

**The strongest evidence for the design choice arrived by accident.** The aggregate fell 4.2 → 3.6
in that run, every point of it measurement failure rather than posture. A threshold gate written the
obvious way — `fail if aggregate < 3.5` — would have passed the run green while three of eighteen
checks silently stopped working. The per-check ratchet failed it and printed Scorecard's own 403.
Until now, "fail closed" was justified here by pointing at two historical defects (barley's
fail-open cassette scrubber, the gitleaks `regexTarget` bug). This is the first time the principle
was tested by an accident instead of a constructed fixture, and it is a much better citation.

Also worth recording because it is funny and it is the point: **a job added to measure whether this
organisation over-grants workflow tokens failed because its own token was under-granted.** Least
privilege has a floor. Finding it is empirical.

**The port to a fifth repository paid for itself before the fourth one merged.** `hops` #545 was
open, green, and carried the identical permission block; its baseline has `CI-Tests` at 10, so it
would have failed on its first run after merge. So would `barley` and `hops-mcp`. The bug was found
in `wort` — the repository furthest from the charter, the one where breaking a CI job costs least.
Generalizable: **when rolling one control out to several repositories, merge it first where a
failure is cheapest, not where it matters most.** The instinct is the opposite, because the
important repo is the one you care about.

One process note. The fix went to `hops` as a *second commit* on the open PR rather than an amend
and force-push. The branch has already been reviewed, including by CodeRabbit; a force-push discards
that review context to save one line of history. Cheap to squash at merge, not cheap to un-lose a
review.

**Same-day addendum.** The three sibling branches were fixed on fresh approval, which also closed
the source drift recorded the day before. Two shapes of the same fix, chosen by review state rather
than by preference: a second commit on `hops` #545 because that branch has been reviewed, an amend
on `barley`, `hops-mcp` and `sowinsights` because those have never been pushed. Worth stating as a
rule, since the instinct is to be consistent across repos: **history hygiene is decided by whether
anyone has read the history yet.**

Each fix was verified under its own repository's gate rather than under ours — barley's ruff,
hops-mcp's prettier, and the respective test runners. Re-running `prettier --check` on hops-mcp's
workflow was not ceremony: prettier claimed that same file during the original port, so it was the
one place where a comment-only edit could plausibly break a gate.

## 2026-08-25 (second run) — the assumption that travels with a copied workflow

`sowinsights` merged and failed at `Set up Python`, not at the gate. `actions/setup-python` resolves
a prebuilt interpreter by operating system from the `actions/python-versions` manifest, which covers
the GitHub-hosted images only; `sowinsights` runs on self-hosted CodeBuild runners.

**The defect was created by the port, and by nothing else.** That step is correct in `barley`, which
runs on `ubuntu-latest`. Copying the workflow across changed one line — `runs-on` — and with it the
validity of a step three lines further down. Nothing in reading the file reveals that; the two
statements are true separately and false together. The rule that would have caught it: **when
porting a workflow, re-verify every step against the target's runner, not only against its
language.** The language check was done carefully — Python twin for the Python repo. The runner
check was not done at all, because `runs-on` had been adapted per repo and therefore felt handled.

A second, cheaper signal was available and ignored: **no other workflow in `sowinsights` uses
`setup-python`.** Absence of precedent in the target repo is evidence, and it was sitting in the
same directory. Where a repo already does a thing, copy how it does it; where it has never done the
thing, treat that as a question rather than a blank slate.

**Good news arrived in the same run, and it is worth separating from the bad.** The token fix from
the previous entry is confirmed: `Packaging` scored 10 and `CI-Tests` scored 0 instead of both
returning -1, and Scorecard's own `Token-Permissions` output names the two new grants by file and
line. Verifying a fix from the artifact of a job that failed for an unrelated reason is only
possible because the upload step is guarded with `if: always()` — a decision made for a different
scenario (preserving evidence when the gate fails) that has now paid off twice in two runs, both
times for reasons it was not designed for.

**Running the comparison offline against the failed run's artifact answered the question the job
could not.** Exit 0, three checks improved, no gated regression — so the gate is correct on that
repo today and only the plumbing was broken. Cheap habit worth keeping: when a CI job dies before
the interesting step, re-run the interesting step locally on whatever the job did manage to produce,
rather than waiting for a green run to find out.

**And the tool caught its own author again, in the opposite direction from last time.** Scorecard's
`Pinned-Dependencies` details listed three unpinned GitHub-owned actions — all three in the
Scorecard workflow itself, a job whose purpose is to gate that very check. It did not fail anything,
because the baseline was 0 and the change was an improvement. **A control that only speaks when it
regresses will not tell you that the control itself is part of the problem.** That one had to be
read, not gated.

## 2026-08-25 (third entry) — the user asked the question the design should have asked itself

After two red default branches in a day, Vladyslav asked why the job runs on merge at all, when by
then the change is already in. The honest answer is that it should not, and the original design
carried an unexamined assumption: that a security check belongs at the same place as the deploy.

**A control has to be placed where the answer is still actionable.** A push-to-`main` run can only
report; the remedy is a revert. Everything the job can catch in a diff is catchable on the pull
request, at the same cost, several hours earlier. Both real failures this week were reported after
the merge and would have been prevented before it. Two data points is not much, but it is two out of
two, and the argument does not depend on them.

**I defended the wrong position first, on an unverified claim.** I argued push-to-`main` was needed
as a backstop because merges here bypass pull requests, citing `Code-Review` scores of 1/30 and
3/22. Checking the last 20 commits on each default branch: `wort` 20/20 through PRs, `hops-mcp`
20/20, `sowinsights` likewise once merge commits are read correctly. **These repos bypass *approval*,
not pull requests.** Scorecard's `Code-Review` counts approvals, and I read an approval statistic as
a process statistic. The lesson is specific and worth keeping: *a metric's name is not its
definition* — the same error as `score` vs `coverage` in Phase 1, and as the Token-Permissions
non-monotonicity, now committed by me rather than found in someone else's tooling.

**The trigger change forced a policy change, and that is the interesting part.** Failing a pull
request is only defensible if every gated check is one its author can fix. Two were not:
`Code-Review` and `CI-Tests` score a rolling window of recent changesets, so gating them means one
pull request fails because two others merged unreviewed that week. Moving them to reported-only
leaves a set with a property worth stating: **every gated check is a property of the tree at the
commit being measured.**

That rule was already written in the script's own `REPORTED` comment — "failures nobody can fix,
which is how a gate gets deleted" — and I had violated it in the same file, for two checks, without
noticing. **Writing the principle down is not the same as applying it**; it took a change of trigger
to expose the inconsistency. Worth a habit: when a stated rule and a list disagree, the list is
usually the older thought.

**Two near-misses caught by asking "what does this repo actually do?" rather than copying.**
`barley`'s pull requests target `develop`, not `main` — a trigger copied from a `main`-merging repo
would never have fired, and the port would have looked complete while measuring nothing. And the
agreement check had been mutating `Code-Review`/`CI-Tests` to synthesise a regression; after the
policy change it would have compared two clean runs and agreed on nothing, still printing ALL AGREE.
**A test whose fixture depends on policy has to be re-read when policy changes** — otherwise it goes
quietly vacuous, which is the same failure mode as a fail-open scanner.

**And the pre-merge test stopped being a manoeuvre.** The original proposal was to add a
`pull_request` trigger temporarily, verify, then strip it before merge — which ships a workflow that
differs from the one tested, exactly the shape of defect that produced §10. Keeping the trigger
makes the verification permanent and applies it to every future edit of the gate and its baseline.
The one-off version would have been thrown away after answering one question once.

## 2026-08-25 (fourth entry) — two safe changes that combined into a silent failure

The first pull-request run of the gate posted its comment, and the comment showed the report was
wrong. `scorecard-action` runs in local directory mode on a `pull_request` event, so seven
API-backed checks do not run; the comparison called five of them "missing from results" — its phrase
for *the measurement broke* — printed an aggregate covering 11 of 18 checks next to a baseline
covering 18, and **passed**.

**The interesting part is not the wrong labels. It is that two individually correct decisions
composed into a fail-open.** Fail-closed had always been scoped to gated checks. Moving
`Code-Review` and `CI-Tests` to reported-only was right on its own terms. Running on pull requests
was right on its own terms. Together they produced a run that measured a little over half the
repository and reported clean — and before the reported-only change, this exact run would have
failed loudly on the same input. **A safety property proven of two changes separately is not proven
of both**, and neither review would have caught it, because each change was examined against the
state before it rather than against the other.

That is the third fail-open in this project's evidence file, and the first one we wrote ourselves.
It arrived where the previous two did: not in the logic, but in the boundary of what the safety rule
covers. barley's cassette scrubber checked a denylist of keys and passed everything else; the
gitleaks rule matched per line and missed anything wrapped; this one failed closed on gated checks
and said nothing about the rest.

**The fix was to describe the mode rather than avoid it.** The instinct was to force a remote scan
on pull requests. That would have been worse: local mode measures the tree being *proposed*, which
is the only thing a pull request can meaningfully be judged on. The right move was to teach the
comparison that a run has a mode, and that "this check did not run here" and "this check should have
run and did not" are different sentences. The gated set is unaffected because all four gated checks
are file-based — but that is now asserted by a test rather than left as a happy accident, along with
the rule that a gated check absent from a local run still fails.

**And the trial paid off exactly as intended.** Porting an untested pattern to five repositories is
what produced the `setup-python` defect; trialling it in one repository first is what caught this
one before four more copies of it existed. The same run also settled three open questions green —
container action on CodeBuild, `setup-node` on CodeBuild, and the comment mechanism — so one push
answered more than it cost. **When a change has an unknown in it, the cheapest experiment is one
instance of it, in the place where being wrong matters least.**

One smaller thing worth keeping: the defect was visible only because the output was put in front of
a human. The same table had been rendering on the run summary page for two days and nobody looked;
it took a pull request comment and the question "does the report look okay?" to surface it. **A
report nobody reads is a report that cannot be wrong.**

## 2026-08-25 (fifth entry) — the trigger set settles, and a filter that was quietly wrong

Final shape, decided by the user: `pull_request` and `push` to the default branch. No cron, no
manual dispatch.

**I argued for the cron and lost on a point I had made myself.** The case for keeping it was that
seven checks — review coverage, open advisories, branch protection — are not in any diff and refresh
only when someone merges. That is true, and in a quiet repository it means months. The counter is
that a day earlier I had written "a report nobody reads is a report that cannot be wrong", after a
defect sat visible on a run summary page for two days and surfaced only once the output reached a
pull request comment. **A signal with no reader is not a signal**, and a weekly run that nobody
opens does not become valuable by being scheduled. The right response to the real loss is a louder
channel — an upserted issue on the push run — not a quieter run on a timer.

**The question that found the actual bug was "does that make sense?".** The user asked why
`Code-Review` and `CI-Tests` are not evaluated on a pull request, since code changes in a pull
request. The answer is that neither measures the diff — both are statistics over merged history —
but answering it properly meant re-reading what each gated check reads from disk, and that exposed
something else: **the `paths: ['.github/workflows/**']` filter meant two of the four gated checks
were not enforced at all.** `Pinned-Dependencies` reads Dockerfiles, `Binary-Artifacts` reads the
whole tree; both had live examples in our own evidence — `Dockerfile:2` in `hops-mcp`,
`app/__pycache__/*.pyc` in `sowinsights`. A pull request unpinning a base image would not have run
the gate.

That filter had been correct once, on a `push`-only design where the concern was API cost, and it
survived two redesigns without being re-examined. **Configuration inherited across a redesign is
where the stale assumptions hide** — the same shape as the `runs-on` defect, one level up: not a
value copied to the wrong repository, but a value kept through a change that invalidated it. Neither
was visible in a diff, because in both cases the wrong line was the one that did not change.

Worth naming the pattern in how these were found. Four defects this week, and none came from
review: the token scopes came from a failed run, `setup-python` from a failed run, the local-mode
fail-open from putting output in front of a person, and the path filter from a user asking a
"does this make sense" question about something adjacent. **Reviewing a change tells you whether it
does what it says. Running it, and showing someone the result, tells you whether what it says is
worth doing.**

**Same-day correction.** `barley`'s push trigger was set to `[main, develop]` because that repo
integrates on `develop`. `scorecard-action` rejects any non-`pull_request` event off the default
branch outright, so it failed on the first merge. The reasoning was right about the repo and wrong
about the tool, and I had already read the file that says so — the branch check sits forty lines
above the local/remote switch I quoted the day before. **Reading a source file for one answer does
not mean you have read it**; I extracted the rule I went looking for and walked past the one next to
it.

Cheap validation available and not used: the same branch adaptation could have been checked against
one run before being written into a commit, and in the end it was — by the failure. The
consolation is that the two runs make an unusually clean pair of evidence, PR into `develop` passing
and push to `develop` failing within a minute of each other, which is what the correction is now
argued from rather than from the source alone.
