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

- [ ] **Verify the cross-repo control matrix** in `CLAUDE.md` against each live repo, and write it
      up as `research/baseline/cross-repo-matrix.md`. Every cell needs the file path that proves it.
- [ ] **Run the same non-mutating scan across all four** — a consistent GitLeaks pass (detect, no
      write) plus a dependency/lockfile check. Same tool, same config, same day: that is what makes
      the numbers comparable. Raw output to `scratch/`, redacted to `artifacts/`.
- [ ] **Git-history secret scan**, not just working tree — a committed-then-deleted secret is still
      in the history, and this is the core in-scope risk. Do all four.
- [ ] **Supply-chain posture per repo**: lockfile present, versions pinned, provenance checked.
      Known: `sowinsights` has `requirements.txt` and no lockfile; `barley` uses `poetry.lock`;
      `hops-mcp` uses `package-lock.json`.
- [ ] **AI-assistance surface per repo**: `.claude/` agents, skills, hooks, `.mcp.json`, `.awos/`.
      Which repos let an agent write code, and what guards that path. `sowinsights` has none of it —
      note whether that means less AI-generated code or just less control over it.
- [ ] **Correlate AI-assistance against security posture.** The article's central question: does
      heavier AI-assisted development show up as more security tooling, or less? Both `hops` and
      `barley` are heavily AI-assisted and land in very different places.

### 1b. `hops` — the deep pass

- [ ] **Mine the newest AWOS audit.** `hops/context/audits/2026-08-03_19-15-15/` — extract every
      FAIL and WARN check from `prevention-coverage.json` (32.6), `supply-chain-security.json`
      (37.5), `ai-security.json` (45) and `application-security.json` (64.8) into
      `research/findings/`. The JSONs are the machine-readable source; `recommendations.md` and
      `report.md` are the narrative.
- [ ] **Chart the score movement across runs.** `2026-03-31`, `2026-04-21`, `2026-04-22`,
      `2026-07-17_14-00-48`, `2026-08-03_19-15-15`. Note the schema change — older runs are markdown
      per dimension, the two newest are JSON. Delta over time is article evidence.
- [ ] **Write `research/baseline/hops-security-baseline.md`.** Start from the baseline table in
      `CLAUDE.md`, verify every row against the live repo, and record what each control actually
      catches versus what it claims to.
- [ ] **Read `hops/docs/processes/security-notes.md`.** Accepted risks with recorded reasoning
      (AS-01 transport, AS-09 auth rate limiting). Anything in there re-raised as a new finding is
      noise.

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

### Known gaps already visible — verify, then size

Spotted during the initial survey; each needs confirming before it becomes a Phase 2 item.

- [ ] **Three of four repos have no secret scanning** — `barley`, `hops-mcp`, `sowinsights` have
      none, local or CI. This is the headline gap.
- [ ] `hops`: `osv-audit-hop-ui` only runs when the PR carries the `frontend` label — dependency
      audit is skipped on unlabelled PRs, and covers `hop-ui` only. `hop-agent`, `e2e` and
      `hop-backend` (gradle) have Dependabot but no PR-time audit gate.
- [ ] `hops`: `scripts/pre-commit` is advisory with a `SKIP_SECRETS=1` escape hatch; its
      `SUSPICIOUS_FILES_PATTERN` is anchored `\.env$`, so `.env.example` is not covered locally.
      CI gitleaks is the real gate — confirm the gap between the two.
- [ ] `hops`: `prevention-coverage` at 32.6 is the lowest score — find which failure-mode clusters
      are unprotected against regression.
- [ ] `hops`: **only `e2e/` and `hop-agent/` commit a `package-lock.json`.** `hop-ui` has a
      `package.json` with no lockfile, and `hop-backend` has no gradle lockfile — unpinned transitive
      dependencies in the two largest modules. Directly in scope (supply-chain), and a likely driver
      of the 37.5 `supply-chain-security` score. Verify against that dimension's checks.
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
