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
