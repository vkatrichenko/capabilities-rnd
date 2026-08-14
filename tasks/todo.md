# Todo — AI SDLC Security capability

Working checklist. Check items off as they land. See `CLAUDE.md` for where output goes.

## Phase 1 — Research

Goal: know exactly what HOPS already has, what it lacks, and what the sources say — before writing
any check.

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
- [ ] **Review the Anthropic "Future of Engineering" security article** → `research/sources/`.
- [ ] **Confirm with Dasha Goranina** whether any AWOS audit material sits outside the HOPS repo.
      The in-repo audits appear to cover it — ask before spending time chasing more.
- [ ] **Open `methodology/log.md`** with the method used so far, including this scaffolding step.

### Known gaps already visible — verify, then size

Spotted during the initial survey; each needs confirming before it becomes a Phase 2 item.

- [ ] `osv-audit-hop-ui` only runs when the PR carries the `frontend` label — dependency audit is
      skipped on unlabelled PRs, and covers `hop-ui` only. `hop-agent`, `e2e` and `hop-backend`
      (gradle) have Dependabot but no PR-time audit gate.
- [ ] `scripts/pre-commit` is advisory with a `SKIP_SECRETS=1` escape hatch; its
      `SUSPICIOUS_FILES_PATTERN` is anchored `\.env$`, so `.env.example` is not covered locally.
      CI gitleaks is the real gate — confirm the gap between the two.
- [ ] `prevention-coverage` at 32.6 is the lowest score — find which failure-mode clusters are
      unprotected against regression.

## Phase 2 — Expand

Build checks in `tooling/`, port into HOPS. **Dev environment only. Never push without asking.**
HOPS uses a mandatory AWOS workflow — read `hops/CLAUDE.md` first.

- [ ] Prioritize the Phase 1 gaps by (impact × effort), quick wins first.
- [ ] Implement, and capture before/after evidence in `artifacts/` for each.

## Phase 3 — Generalize

- [ ] Extract what transfers beyond HOPS — and state what does not.
- [ ] Draft `article/`.

## Deferred by design

- [ ] Sync with Max Ivanchenko / Vasiliy Ilichev on their roadmap. The charter mandates independent
      research first — **do not** open this until Phase 1 is complete.
