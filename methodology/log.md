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
