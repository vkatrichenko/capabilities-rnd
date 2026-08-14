# Todo — AI SDLC Security capability

Working checklist. Check items off as they land. See `CLAUDE.md` for where output goes.

## Phase 1 — Research

Goal: know exactly what the four BarHopping repos already have, what they lack, and what the sources
say — before writing any check.

**Research covers all four repos: `hops`, `barley`, `hops-mcp`, `sowinsights`.** All read-only; scans
must be non-mutating. Only `hops` is a change target in Phase 2.

### 1a. Cross-repo sweep — the same questions asked of all four

The comparison *is* a finding. `hops` is the only repo with any secret scanning; quantify that gap
rather than just asserting it.

- [x] **Verify the cross-repo control matrix** → `research/baseline/cross-repo-matrix.md`
      (2026-08-14, every cell with its proof path).
- [x] **Run the same non-mutating scan across all four** — gitleaks 8.24.3 (the hops CI gate
      version), default config, full history + hops worktree with its own tuned config. Raw JSON in
      `scratch/`; redacted report → `research/findings/secret-scan-2026-08-14.md`.
- [x] **Git-history secret scan** — done as above. Headline: hops post-gate history clean; barley
      has 22 real-format credentials in history, **3 still in HEAD** (2× gitlab-rrt in VCR
      cassettes, 1× slack-bot-token in `reports/smoke.html`) → owner rotation check needed.
- [x] **Supply-chain posture per repo** — in the matrix. `sowinsights`: 13 deps, 0 pinned, no
      lockfile, `.pyc` committed. `hops`: lockfiles only in `e2e/` + `hop-agent/`.
- [x] **AI-assistance surface per repo** — counts in the matrix (agents/skills/commands/hooks/MCP).
      hops-mcp's single hook is quality (tsc/eslint), not security — only `hops` guards the agent
      write path.
- [x] **Correlate AI-assistance against security posture** — barley has the *largest* AI surface
      and *zero* secret scanning; tooling is audit-driven (hops gate ← audit R7/PRV-01), not
      adoption-driven. Written up in the matrix; quantified by the scan.

### 1b. `hops` — the deep pass ✅ (2026-08-14)

- [x] **Mine the newest AWOS audit** → `research/findings/hops-audit-analysis.md`. Key correction:
      `score` is a raw weight sum, not a percent — real health is `coverage` (ai-sec 100%,
      supply-chain 96.2%, prevention 81.5%, app-sec 80%). Open items: PRV-05, PRV-08, PRV-17,
      SCS-08, AS-01 (accepted risk), AS-11, AS-13 (audit FP).
- [x] **Chart the movement across runs** — 07-17 → 08-03: prevention 66→81.5, supply-chain
      83.3→96.2, app-sec 66→80. Causal chain dated: PRV-01 FAIL (07-17) → `.gitleaks.toml` commit
      `835529c5a` (07-30) → PASS (08-03). Older 3 runs: different schema, narrative only.
- [x] **Write `research/baseline/hops-security-baseline.md`** — 5 layers verified, claims-vs-catches
      noted per control.
- [x] **Read `hops/docs/processes/security-notes.md`** — AS-01 + AS-09 accepted/designed with
      reasoning; audit re-flags AS-01 every run (no waiver mechanism — reconciliation gap, in the
      findings).
- [x] **NEW — audit blind spots found (report upstream to AWOS audit owners):** AS-13 false
      positive (4 per-module `.env.example` files exist; detector checks root only) and AIS-03
      phantom skip (hooks in `scripts/claude-hooks/` never scanned — detector assumes
      `.claude/hooks/`), so ai-security's 100% is overstated.

### 1c. `barley`, `hops-mcp`, `sowinsights` — the lighter pass

- [ ] **`barley`** — read its `context/audits/2026-06-03/security.md` (older markdown schema, not
      score-comparable with the newest `hops` runs — say so rather than comparing numbers). Study
      `.pre-commit-config.yaml`, especially the local `pii-scan-evals-datasets` regex scanner: a
      repo-grown control worth writing up. Terraform/`.tflint.hcl` is out of scope (IaC security).
- [ ] **`hops-mcp`** — small, modern TS MCP server, no security tooling at all. The cleanest test of
      "what does a from-scratch baseline cost?" Also: an MCP server is itself an AI-SDLC attack
      surface — check `.mcp.json` and the tool definitions.
- [ ] **`sowinsights`** — the low-water mark: no `.claude/`, no AWOS, no lockfile, `.pyc` files
      committed. Confirm the `.pyc` commit and check `.env_example` for real values.

### 1d. Sources and process

- [ ] **Review the Anthropic "Future of Engineering" security article** → `research/sources/`.
- [ ] **Confirm with Dasha Goranina** (a) whether any AWOS audit material sits outside the repos, and
      (b) that read-only research across all four BarHopping repos is covered by the existing
      approval — the charter names HOPS specifically.
- [ ] **Open `methodology/log.md`** with the method used so far, including this scaffolding step.

### 1e. Phase 1 closeout — HTML presentation

- [ ] **Generate `artifacts/phase1-report.html`** — a self-contained HTML presentation of Phase 1,
      built **only after 1a–1d are all done** so it reflects the complete picture. Three sections:
      1. **What already exists** — the verified cross-repo control matrix + the hops baseline,
         from `research/baseline/`.
      2. **What is missing** — the gap analysis: per-repo holes, the secret-scan findings
         (redacted), audit FAIL/WARN checks, from `research/findings/`.
      3. **What should be implemented** — prioritized recommendations (impact × effort), split
         into `hops` changes (Phase 2 scope) vs recommendations for the other three repos.
      Self-contained (inline CSS, no external assets), redacted to the same standard as the
      findings files — it will be shown to the team. This doubles as the Monday 2026-08-18
      progress answer.

### Known gaps already visible — verify, then size

Spotted during the initial survey; each needs confirming before it becomes a Phase 2 item.

- [x] **Three of four repos have no secret scanning** — verified and now quantified: the ungated
      `barley` carries 22 real-format credentials in history vs `hops`' 2 (both pre-gate). See
      `research/findings/secret-scan-2026-08-14.md`.
- [ ] **NEW — barley rotation check (owner action, not ours):** 3 real-format tokens still in HEAD
      + 13 Slack tokens in Terraform history (2024-12→2025-07, dev & prod). Raise with the barley
      owners via Ruslan/Rodion — removal ≠ revocation.
- [ ] `hops`: `osv-audit-hop-ui` only runs when the PR carries the `frontend` label — dependency
      audit is skipped on unlabelled PRs, and covers `hop-ui` only. `hop-agent`, `e2e` and
      `hop-backend` (gradle) have Dependabot but no PR-time audit gate.
- [ ] `hops`: `scripts/pre-commit` is advisory with a `SKIP_SECRETS=1` escape hatch; its
      `SUSPICIOUS_FILES_PATTERN` is anchored `\.env$`, so `.env.example` is not covered locally.
      CI gitleaks is the real gate — confirm the gap between the two.
- [x] ~~`prevention-coverage` at 32.6 is the lowest score~~ — **corrected**: 32.6 was a raw weight
      sum; real health 81.5%. The open regression gaps are PRV-05 (module boundaries), PRV-08
      (docs checks), PRV-17 (agent-config surface) — see `hops-audit-analysis.md`.
- [x] ~~`hop-ui` has no lockfile~~ — **corrected**: `hop-ui/pnpm-lock.yaml` exists (earlier grep
      missed pnpm). Remaining real gap: `hop-backend` gradle has a version catalog but no
      transitive lockfile / dependency-verification metadata.
- [ ] `barley`: pre-commit exists but carries no secret scanning — the framework is already in
      place, so adding `gitleaks` there is a genuine quick win (recommendation only, not a change).
- [ ] `sowinsights`: no lockfile and committed `.pyc` — smallest repo, largest relative gap.

## Phase 2 — Expand

Build checks in `tooling/`, port into **`hops` only**. **Dev environment only. Never push without
asking.** `hops` uses a mandatory AWOS workflow — read `hops/CLAUDE.md` first.

- [ ] Prioritize the Phase 1 gaps by (impact × effort), quick wins first.
- [ ] Implement, and capture before/after evidence in `artifacts/` for each.
- [ ] Write gaps found in `barley` / `hops-mcp` / `sowinsights` as **recommendations**, not changes —
      they are outside the approved change scope. Their value is proving the tooling generalizes.

## Phase 3 — Generalize

- [ ] Extract what transfers beyond `hops` — and state what does not. The four repos span Kotlin,
      Python, TypeScript, monorepo and single-service, hardened and bare: if a check works across
      that spread it is a capability, not a HOPS config.
- [ ] Draft `article/`.

## Deferred by design

- [ ] Sync with Max Ivanchenko / Vasiliy Ilichev on their roadmap. The charter mandates independent
      research first — **do not** open this until Phase 1 is complete.
