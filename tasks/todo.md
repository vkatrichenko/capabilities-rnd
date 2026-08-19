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

### 1c. `barley`, `hops-mcp`, `sowinsights` — the lighter pass ✅ (2026-08-14)

→ `research/findings/satellite-repos-1c.md`

- [x] **`barley`** — 06-03 audit read (62%/C). Its side finding: **live prod RDS password +
      LangSmith key + OAuth secret in plaintext `.claude/settings.local.json` allow-patterns**
      (gitignored, on disk; rotation recommended 06-03, status unknown → joins rotation list).
      Its SEC-04 "no committed secrets" PASS is wrong — the grep excluded `tests/`, where the
      cassette tokens live. **VCR root cause found**: headers filtered well; body scrubber is a
      key denylist that misses `runners_token` → fail-open scrubbing, no gate behind it.
- [x] **`hops-mcp`** — clean code/history; finding is `.mcp.json`: third-party `serena` MCP run
      from an **unpinned git URL** via uvx.
- [x] **`sowinsights`** — low-water mark confirmed; `.env_example` clean (Secrets-Manager name,
      not value); mutable `python:3.11-bullseye` base image noted.
- [x] **NEW — cross-repo MCP supply-chain pattern**: every stdio MCP config executes a
      mutable-version third party (`:latest` image / git URL / `@latest` / `@canary`). AIS-04
      passes it anyway. Phase 2 candidate: an MCP-config pinning check — generalizable, in scope.

### 1d. Sources and process

- [x] **Review the Anthropic security article** →
      `research/sources/anthropic-ai-native-sdlc-security.md`. The actual piece: "How Anthropic
      secures its AI-native software development lifecycle" (claude.com/blog). Includes the
      practice→BarHopping mapping table — the Phase 2 fuel. Two companion articles noted as
      optional follow-ups (Zero Trust for Agents; CISO's guide to agentic AI).
- [x] **Audit material location confirmed** (Vladyslav, 2026-08-14): everything audit-related is
      in `context/audits/` — nothing lives outside the repos. No ask to Dasha needed for this.
- [ ] **Confirm with Dasha Goranina** — remaining question only; draft moved to Phase 2 **G0.2**,
      which is where it is now tracked.
- [x] **`methodology/log.md`** — open and current since 1a (entries for 1a, 1b, 1c, 1d).
- [x] **Broader source sweep** (2026-08-14, user-requested) →
      `research/sources/sdlc-security-landscape.md`: secret-scanning layering consensus
      (gitleaks pre-commit + TruffleHog-verify CI + push protection), Veracode 45%-vulnerable
      AI-code data, slopsquatting (19.7% hallucinated packages, USENIX 2025), dependency
      cooldowns (pnpm default since v11 — closes audit SCS-04 for one line), CSA/OWASP-agentic
      MCP controls (validate the 1c pinning finding), NIST SP 800-218A, OWASP CI/CD Top 10,
      OpenSSF Scorecard. Ends with a cost-ranked Phase 2 shortlist.
- [ ] Deep-read before the article cites them (marked ★ in the landscape file): USENIX
      slopsquatting paper, Veracode report, OWASP Agentic Top 10, TruffleHog verification docs,
      OpenSSF Scorecard checks.

### 1e. Phase 1 closeout — HTML presentation ✅ (2026-08-14)

- [x] **`artifacts/phase1-report.html`** — self-contained (inline CSS, no external assets,
      light + dark + print), redacted to the findings-file standard. Three sections as specified:
      exists / missing / implement, with the 12-item cost-ranked recommendation table split into
      hops scope vs owner recommendations. Render-verified in both themes via headless Chrome.
      Local file only — NOT published anywhere (internal-only constraint). This is the Monday
      2026-08-18 progress answer.
- [x] **Reframed as blueprint (2026-08-14, user request):** §1 table is now industry best
      practice × benchmark source × status × implemented × missing — the blueprint for future
      projects and the basis of the client capability story. Header carries an INTERNAL EDITION
      banner: §2 names repos/findings.
- [x] **Restructured into tabs + published as artifact (2026-08-14, user request):** six tabs —
      Overview (managers + engineers) / Industry standards / AWOS audit (sourced from
      github.com/provectus/awos + our mined run data) / HOPS implementation / Gaps & roadmap /
      Methodology. Published (private, share via the page's share menu):
      https://claude.ai/code/artifact/22daff05-9a26-4289-a3c3-81e2cee4cf11
      Redeploy = republish the same file path.
- [ ] **Client-safe variant** before any external presentation: strip repo names, leak details,
      and the rotation callout from Gaps; keep the blueprint + anonymized evidence ("measured a
      10× leak-rate difference between gated and ungated projects").

**→ PHASE 1 COMPLETE.** Only open thread: Dasha's read-only-scope confirmation (1d) and the
barley rotation ask — both human actions, neither blocks Phase 2.

### Known gaps already visible — verify, then size

Spotted during the initial survey; each needs confirming before it becomes a Phase 2 item.

- [x] **Three of four repos have no secret scanning** — verified and now quantified: the ungated
      `barley` carries 22 real-format credentials in history vs `hops`' 2 (both pre-gate). See
      `research/findings/secret-scan-2026-08-14.md`.
- [ ] **NEW — barley rotation check (owner action, not ours):** 3 real-format tokens still in HEAD
      + 13 Slack tokens in Terraform history (2024-12→2025-07, dev & prod). Raise with the barley
      owners via Ruslan/Rodion — removal ≠ revocation. **1c addition:** their own 06-03 audit also
      flagged a live prod RDS password, LangSmith key, and OAuth secret in local
      `.claude/settings.local.json` — rotation status unknown; include in the same ask.
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

## Phase 2 — Expand (approved plan, 2026-08-14)

Report approved by managers. Process: **one small hops PR per item**, referencing the audit-check
ID it closes (the same pattern the gitleaks gate used — single PR citing R7/PRV-01); no full AWOS
spec cycle for these config/security changes, courtesy heads-up to the HOPS tech lead in the
first PR. **Dev env only. Never push without explicit confirmation.** Items execute one at a
time, each on an explicit go.

### Gate 0 — before any hops change

Gate 0 exists so the before/after evidence is captured **before** the first PR — once W1.1 merges,
the baseline is unrecoverable.

- [ ] **G0.1 — rotation ask to barley owners** (via Ruslan / Rodion). Human action,
      time-sensitive. **Triage completed 2026-08-18** — send the message below and attach
      `research/findings/barley-rotation-runbook.md`, which carries the per-credential inventory
      (fingerprints, exact file + line, exposure windows), the rotation steps per system, and the
      three prevention fixes. Corrections to the numbers below are in that file: **7** real-format
      credentials, not 22 — the earlier count was occurrences across commits, not distinct values;
      3 further matches are placeholders. Ready to send:
      > Hi! While researching AI-SDLC security across the BarHopping org (read-only, no changes)
      > I ran gitleaks 8.24.3 over the git history of all four repos. barley has credential
      > material that needs an **owner-side rotation check** — I did not test any of it for
      > validity, so "is it still live?" is your call, not mine.
      >
      > Still in HEAD (3):
      > • GitLab runner token, ×2 VCR cassettes under `tests/integration/fixtures/vcr_cassettes/`
      >   (committed 2026-03-27)
      > • Slack bot token embedded in `reports/smoke.html` (committed 2025-09-24)
      >
      > History-only, removed from HEAD but present in every existing clone: 13 Slack tokens
      > (bot / app / user) hardcoded in `terraform/**` across **dev and production**, 2024-12 →
      > 2025-07; one service-account private key in `tests/credentials.json`; two STS temporary
      > AWS keys (self-expiring). **Removal from HEAD is not revocation** — these are still
      > readable in history.
      >
      > Separately, your own 2026-06-03 audit (`context/audits/2026-06-03/security.md`) flagged a
      > live production RDS password, a LangSmith API key and an AgentCore OAuth client secret
      > sitting in plaintext allow-patterns in `.claude/settings.local.json` (gitignored, on
      > disk). It recommended rotation at the time; I can't tell from the repo whether that
      > happened — worth confirming in the same pass.
      >
      > Full redacted detail (rule + file + date + masked prefix, no values):
      > `capabilities-rnd/research/findings/secret-scan-2026-08-14.md`.
      >
      > A follow-up with the concrete fixes — porting the hops gitleaks gate into your existing
      > `.pre-commit-config.yaml`, and the fail-closed cassette-scrubbing pattern that would have
      > stopped the runner token being recorded — is coming separately; this message is only the
      > rotation ask, because that part is time-sensitive.
- [ ] **G0.2 — Dasha Goranina, sibling-repo scope confirmation.** Human action. Ready to send:
      > Hi Dasha! The charter names HOPS as the test project; for the research (read-only, no
      > changes) I also compared it against the sibling repos in the BarHopping org — barley,
      > hops-mcp, sowinsights. Can you confirm read-only analysis of those is fine under the
      > existing approval? Changes still go to hops dev only.
- [x] **G0.3 — OpenSSF Scorecard baseline** (2026-08-18) →
      `artifacts/scorecard-baseline-hops.md`. Full remote mode, Scorecard v5.1.1-45-g40bbc9c9,
      image pinned by digest, target `origin/main` @ `f640dee9f`. **Aggregate 5.4/10.**
      SSO unblocked by re-running `gh auth login --web` (the standalone authorization_request URL
      did not bind to the CLI token; the device-code flow did).
      Only inconclusive check: Signed-Releases (−1, no releases exist).
- [x] **G0.4 — the "before" reference** → `research/baseline/phase2-before-state.md` (2026-08-18).
      Link-only note: 2026-08-03 audit coverage, tuned-gitleaks worktree state, control matrix,
      the pinned hops commit, and the two pre-existing toolchain facts found while scoping W1.1.
      Scorecard row filled in from G0.3. **Corrected:** the pinned commit is origin/main
      `f640dee9f`, not the local clone's `0a5303371` — the local clone was 5 days behind.

### Wave 1 — config quick wins (hops, one PR each)
- [x] **W1.1** pnpm toolchain pin + dependency cooldown (2026-08-18) — committed `ccfc77828` on
      `HOP-0000/pnpm-toolchain-pin-and-cooldown`, **not pushed**. Evidence:
      `artifacts/w1-1-pnpm-cooldown-evidence.md`.
      **The item was mis-scoped and grew.** "Add `minimumReleaseAge: 1440`" would have been a
      no-op: CI ran `npm install -g pnpm` unpinned → pnpm 11, which already defaults it to 1440,
      while `hop-ui/Dockerfile` pinned `pnpm@9`, which predates the setting. The real defect was
      the floating toolchain. Two controls were also silently dead — `.npmrc save-prefix` (audit
      R5/SCS-03 exact pinning; `.npmrc` is auth/registry-only since pnpm 11) and
      `pnpm.onlyBuiltDependencies` (removed in pnpm 11).
      **Near-miss worth remembering:** the Dockerfile never copied `pnpm-workspace.yaml`, so the
      image build depended on the `package.json` field being removed here — dropping it without
      adding the COPY fails the build with `ERR_PNPM_IGNORED_BUILDS`. Caught and reproduced.
      ✅ `pnpm run test:coverage` resolved: 4 failed / 4415 passed on the branch — **identical to
      unmodified `origin/main`**. An earlier 60-failure run was machine load (all 5000ms timeouts,
      2.8× slower); the control run settled it. Pre-existing: main does not pass its own suite.
      Window is 1440, not AWOS's 10080 — see the evidence file for why.
- [ ] **W1.2** Un-gate dependency audit: drop the `frontend`-label condition on the osv job in
      `.github/workflows/hops-mr-check.yml`; extend to `hop-agent/`, `e2e/` (npm) and
      `hop-backend` (gradle); verify: osv runs on an unlabeled PR.
      **Now has a number (2026-08-18):** Scorecard's OSV pass reports **65 open advisories** on the
      repo while the audit is label-gated to `hop-ui`. Triage them with `osv-scanner` directly —
      Scorecard gives IDs only, no severity or reachability, so "65" is not "65 exploitable".
- [ ] **W1.3** PRV-17: security-sensitive declaration for the agent-config surface in hops
      `CLAUDE.md` (+ module CLAUDE.mds if the audit reads them); review rule for `.claude/`,
      hooks, `.mcp.json` changes
- [ ] **W1.4** Pin the github MCP image to a digest in hops `.mcp.json` (kills `:latest`).
      No audit delta — AIS-04 already PASSes the unpinned config; evidence is the diff plus
      W2.1's checker output. **Widen it (2026-08-18):** Scorecard found **17 unpinned third-party
      GitHub Actions** (`hops-dev.yml` ×5, `hops-main.yml` ×5, `hops-mr-check.yml` ×5,
      `hops-demo.yml`, `hops-preview.yml`) — the CI-side twin of the `.mcp.json` finding, same
      control, and this one moves Scorecard's Pinned-Dependencies. Pin both surfaces in one item;
      leave the 100 GitHub-owned actions alone (low risk, high churn).

- [ ] **W1.5 — NEW (2026-08-18, found at Gate 0)** Relocate the agent hook to `.claude/hooks/`
      (move or symlink `scripts/claude-hooks/block-secrets.sh`; keep `.claude/settings.json`
      working). The detector's `.claude/hooks/` path assumption costs hops **twice**: `AIS-03`
      SKIPs (so the malicious-hook-content check never runs — ai-security's 100% is overstated)
      and **`ADP-04` FAILs 0/5** for hooks that demonstrably exist. This is the cheapest item in
      Wave 1 with a *real* audit delta: ADP-04 FAIL→PASS (+5, ai-sdlc-adoption 86.6%→95.2%) and
      AIS-03 starts executing. Sequence with **W3.4**: relocating works around the bug, filing it
      upstream fixes it for every repo — do both, workaround first, and use it as evidence in the
      bug report. Detail: `research/baseline/phase2-before-state.md`.

### Wave 2 — portable tools (build in `tooling/`, self-test, then port to hops)
- [ ] **W2.1** MCP pinning check — flags `:latest`/`@canary`/ref-less git URLs in `.mcp.json`;
      fixture self-tests first; then hops CI job; read-only run across all four repos for the
      article table
- [ ] **W2.2** Hook-content scan: `scripts/claude-hooks/` + any path referenced from
      `.claude/settings.json` (covers the AIS-03 phantom skip); self-test, then hops CI.
      **Scope is wider than written:** 3 of hops' 4 registered hooks exist only as *inline*
      `command` strings inside `.claude/settings.json` — the scanner must read those too, not
      just files under a hooks directory.
- [ ] **W2.3** OpenSSF Scorecard action in hops CI; delta vs the Gate 0 baseline

### Measurement checkpoint (after Waves 1–2)
- [ ] Re-run `/awos:ai-readiness-audit` on hops — acceptance: **no dimension regresses**.
      Only three of the wave's items produce an audit delta at all: **PRV-17** (WARN 1/2 → PASS),
      **ADP-04** (FAIL 0/5 → PASS) and **AIS-03** (SKIP → actually executes). SCS-04 will skip
      again regardless of W1.1 — do not report it as a win. Baseline to compare against:
      `research/baseline/phase2-before-state.md`.
- [ ] Re-run gitleaks (tuned) + osv; evidence per item → `artifacts/` (before / PR link / after)
- [ ] `methodology/log.md` entry for the wave

### Wave 3 — medium items
- [ ] **W3.1** Hallucinated-package CI check — design note in `research/findings/` first, then
      `tooling/ci/`, then hops (flagship novel check)
- [ ] **W3.2** Threat-model doc for hops (closes AS-11); doubles as publication material
- [ ] **W3.3** Reinstate `/security-review` as a hops skill + the finding→instruction-file loop
      rule
- [ ] **W3.4** File AWOS detector bugs upstream (AS-13 root-only `.env.example`, AIS-03
      `.claude/hooks/` path, barley SEC-04 tests-exclusion) → issues on `provectus/awos`

### Recommendations to owners (not our changes)
- [ ] **NEW, highest value (2026-08-18) — require `secret-scan` as a status check on `hops` `main`.**
      Verified from two GitHub endpoints: `main` requires a PR + 1 approval and **zero passing
      checks** (`enforcement_level: "off"`, enterprise ruleset carries only `deletion`,
      `non_fast_forward`, `pull_request`). The gitleaks gate, SonarQube and osv are all advisory at
      merge time. Repo-settings change, needs an admin — ours is not one. Raise with the HOPS tech
      lead alongside the W1 heads-up. Detail: `artifacts/scorecard-baseline-hops.md` finding 1.
- [x] Hand barley owners the gitleaks-port recipe + fail-closed scrubbing pattern (2026-08-18) →
      `research/findings/barley-rotation-runbook.md` — full triage + rotation runbook, folded
      together with G0.1 since they go to the same people. Still to send.
- [ ] Check GitHub push-protection availability on the org plan (question, not a change)

## Phase 3 — Generalize

- [ ] Extract what transfers beyond `hops` — and state what does not. The four repos span Kotlin,
      Python, TypeScript, monorepo and single-service, hardened and bare: if a check works across
      that spread it is a capability, not a HOPS config.
- [ ] Draft `article/`.

## Deferred by design

- [ ] Sync with Max Ivanchenko / Vasiliy Ilichev on their roadmap. The charter mandates independent
      research first — **do not** open this until Phase 1 is complete.
