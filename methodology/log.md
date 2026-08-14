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
