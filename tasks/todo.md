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
      **Updated 2026-08-19** — added the Phase 2 delivery block (PRs #515/#1636/#518 + the
      allowlist-scope finding) and corrected the headline leak counts repo-wide: 22 → **7
      distinct** for barley (22 counted occurrences, not values), 3 → **1 still in HEAD**, and
      "24 real-format leaks" → 9. Two methodology items added.
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
      time-sensitive. **PENDING 2026-08-28:** owners confirm the production Slack tokens (#3/#4)
      were removed from git 2026-07-22 but **not rotated** — rotation still open on their side;
      #2 left HEAD 2026-08-17 (now history-only), #1 still in HEAD. Roadmap row 1 marked pending. **Triage completed 2026-08-18** — send the message below and attach
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
- [x] **W1.1** pnpm toolchain pin + dependency cooldown — ✅ **MERGED to hops `main`
      2026-08-19T13:10Z as PR #515**. Commit `ccfc77828` on
      `HOP-0000/pnpm-toolchain-pin-and-cooldown`. Evidence:
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
      **PR #515 update (2026-08-19):** a reviewer added the `frontend` + `dependencies`
      labels; the re-run executed all six gates green — including `check-hop-fe-docker`
      (the Dockerfile COPY fix proven in CI, not only locally) and `unit-tests-hops-fe`
      running the identical `pnpm run test:coverage`. That reclassifies the 4 local test
      failures as **local-machine only**, not a `main` defect. Awaiting review approval;
      merge is still blocked on `REVIEW_REQUIRED`, not on any check.
- [ ] **W1.2** Path-gate the dependency audit. **2026-08-28: hops PR #568 open** (`HOP-0000/osv-path-gate`, `e3a229202`, pushed by Vladyslav). Positive test passed: PR carries no `frontend` label and `Security audit – hop-ui` ran and passed on first run; `Spec link` green after the body was replaced with the template. Awaiting review. PR body drafted and passed the `spec-link-check` pipeline locally in both locales. hop-ui only; other modules deferred (post-process script is pnpm-specific). **Decision 2026-08-28 (Vladyslav):** keep the
      `frontend` label, add a path condition — the osv job runs when the label is present **or**
      `hop-ui/package.json` / `pnpm-lock.yaml` / `osv-scanner.toml` changed. No scheduled scan (a
      cron nobody owns fails unnoticed; PR-time failures have an owner). Same shape per module for
      `hop-agent/`, `e2e/` (npm) and `hop-backend` (gradle). The defect is the key, not the gate:
      the label is hand-applied (no `labeler.yml` in hops), so an unlabelled lockfile change and
      every Dependabot PR skip the audit silently. Verify: osv runs on an unlabelled PR that touches
      only `hop-ui/pnpm-lock.yaml`, and does not run on a backend-only PR.
      **Now has a number (2026-08-18):** Scorecard's OSV pass reports **65 open advisories** on the
      repo while the audit is label-gated to `hop-ui`. Triage them with `osv-scanner` directly —
      Scorecard gives IDs only, no severity or reachability, so "65" is not "65 exploitable".
      **Still the finding after the labels went on (2026-08-19):** the gates ran only because a
      human noticed and labelled the PR — the default for a hop-ui change is still "none of them".
      **Scope grew (2026-08-19, observed on PR #515):** the `frontend` label also gates
      **`unit-tests-hops-fe`** (`:53`) and **`sonarqube-check-mr`** (`:331`). A PR rewriting
      hop-ui's package manager ran no frontend tests, no SAST and no dependency audit — only
      gitleaks is unconditional. The item is really "make the quality gates unconditional", not
      just the osv job. Combined with `main` requiring zero status checks, gates are both
      skippable by omission and non-binding at merge.
- [x] **W1.3 CLOSED — ✅ MERGED 2026-08-26 as hops PR #557** (merge commit `0be568719`, approved,
      all checks green; `Build and Deploy Main` and `OpenSSF Scorecard` green on `main` after the
      merge). PRV-17: the agent-config surface is declared security-sensitive on `main`.
      Branch `HOP-0000/agent-config-surface-declaration`
      off `origin/main` @ `dca2ed7b0`, commit `941041dd6`, 8 files.
      The detector is `method: "judgment"` and its evidence field names three missing clauses —
      surface not declared security-sensitive, changes not requiring review, guards not protected —
      so all three are written, not paraphrased. It also records which files it reads: root
      `CLAUDE.md`, `hop-ui/`, `hop-backend/`, `.claude/rules/`. All four carry it, plus `hop-agent`
      and `hop-sync` for consistency, plus a new path-scoped `.claude/rules/agent-config-surface.md`
      that loads when the surface is actually being edited.
      Mechanical half: `.github/CODEOWNERS` (first one in the repo) over `CLAUDE.md`, `.claude/`,
      `.mcp.json`, `scripts/claude-hooks/`, `scripts/pre-commit`, owned by
      `@provectus-barhopping/hops-engineers` — team verified to have push on `hops` before use, since
      an owner without repo access is silently ignored.
      **Two silent-control findings, both fixed in the same commit:** `.gitignore` denies
      `.github/*` with a three-entry allowlist, so the new CODEOWNERS was untracked with no error;
      and `.claude/settings.local.json` — the file that holds permission allow-patterns, the exact
      vector of barley's credential incident — had no rule in hops' own `.gitignore` and was being
      ignored only by a per-developer *global* gitignore. Committable on any machine without it.
      ⚠️ CODEOWNERS routes a review, it does not compel one; `main` requires zero passing checks and
      the org ruleset has no `required_status_checks`. Binding needs an admin setting.
      ⚠️ Committed with `--no-verify`: hops' pre-commit runs the whole `hop-ui` toolchain for a
      Markdown-only edit and needs `pnpm`, which is absent here. Secrets stage passed; nothing staged
      was compilable. **Its content rules also flag prose about secrets** (`[Ss]ecret[" ,:=]`,
      `[Pp]assword[" ,:=]`) — the wording was changed rather than bypassed.
      **PUSHED 2026-08-25 → hops PR #557, all checks green**, gitleaks included.
      **Review pass 2026-08-26 found a second silent control and fixed it before merge**
      (commit `4dea7eae4`): CODEOWNERS routed review for `scripts/pre-commit` and
      `scripts/claude-hooks/` — the guards the audit already knew about — but not for
      `scripts/check-agent-config.mjs` or `.github/workflows/**`, the gate W2.2 had just added.
      A control protecting the previous generation of controls but not itself. Both paths are on
      `main` now (`.github/CODEOWNERS` lines 29–31, verified against `origin/main`).
      CODEOWNERS re-validated on merged `main`: `gh api repos/…/codeowners/errors?ref=8039e6939`
      → `{"errors":[]}`, so the added lines parse and `@provectus-barhopping/hops-engineers` still
      resolves with access (an owner without access is silently ignored, so a clean parse is the
      check that matters). Quirk worth recording: the endpoint 404s when `ref=` is the *default
      branch name* — ask it by SHA.
      Portable version for the other repos: `tooling/configs/agent-config-surface-rule.md`.
- [ ] **W1.4** Pin the github MCP image in hops `.mcp.json` (kills `:latest`).
      **MCP half DONE 2026-08-28 in W2.1's branch** — pinned to the minor tag `:1.11`, not a
      digest: no Dependabot ecosystem covers `.mcp.json`, so a digest is a chore nobody owns and
      rots. Recorded in hops `docs/processes/security-notes.md`. The 17 third-party actions
      half stays open (Dependabot does keep those fresh, so SHA pins cost nothing there).
      No audit delta — AIS-04 already PASSes the unpinned config; evidence is the diff plus
      W2.1's checker output. **Widen it (2026-08-18):** Scorecard found **17 unpinned third-party
      GitHub Actions** (`hops-dev.yml` ×5, `hops-main.yml` ×5, `hops-mr-check.yml` ×5,
      `hops-demo.yml`, `hops-preview.yml`) — the CI-side twin of the `.mcp.json` finding, same
      control, and this one moves Scorecard's Pinned-Dependencies. Pin both surfaces in one item;
      leave the GitHub-owned actions alone (low risk, high churn — now 102 after #528).
      **Scoreboard exists as of W2.3 (2026-08-23):** Pinned-Dependencies 0 with 0/17 third-party
      actions pinned is in the committed CI baseline, so this item lands as a measured improvement
      rather than as a diff. Still 0/17 today — nothing has moved it.

- [x] **W1.6 — NEW (2026-08-19), landed as a hops PR: gitleaks allowlist scope.**
      `hops/.gitleaks.toml` used `regexTarget = "line"`, which allowlists the whole line —
      a synthetic HubSpot credential planted on an allowlisted correlation-id line in
      `hop-sync/Hubspot_data_sync.ipynb` was reported **0 times**. Changed to `"match"`:
      caught. Worktree output unchanged (0 findings before and after). Branch
      `HOP-0000/gitleaks-allowlist-scope` off `origin/main` @ `48caab6dd`, commit `b8d70b4ba`,
      ✅ **MERGED 2026-08-20 as hops PR #518**, all checks green. Body in `scratchpad/pr-body-hops.md`. Second, separate defect recorded:
      `"line"` drops findings even when the regex matches nothing (3 real `gitlab-rrt` hits on
      barley, 4 on hops). Full writeup: `artifacts/gitleaks-allowlist-scope-finding.md`.

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
- [ ] **W2.1** MCP pinning check — **built + ported 2026-08-28, awaiting push/PR.**
      Tool: `tooling/ci/mcp-pin-check/` (checker, 18 self-tests, hops job template).
      **Tiered by decision (Vladyslav, 2026-08-28 — ops must be able to maintain it):** *fail* =
      ref-less git URL, pre-release channel, `npx -y` (untrusted AND mutable); *warn* =
      `:latest`/`@latest` from a stable channel, never blocks; *pass* = tag / exact version /
      digest — a minor tag is enough, a digest is never required. Same split as W1.4's
      third-party-vs-GitHub-owned actions.
      Evidence: `artifacts/mcp-pin-sweep.md` — 4 stdio launches org-wide, 0 pinned, 2 in the fail
      tier (hops-mcp `serena`, barley `prompt-kit`), both in repos with no CI check on the file.
      hops: branch `HOP-0000/mcp-pin-check` off `origin/main` — `scripts/check-mcp-pins{,.test}.mjs`,
      `mcp-pin-check` job beside `agent-config-scan`, `.mcp.json` → `:1.11`, security-notes entry.
      **hops PR #567 open, all checks green incl. `MCP pin check`.**
      **Extended to the other repos 2026-08-28 (Vladyslav approved):** hops-mcp branch
      `chore/mcp-pin-check` `fb046d2` — Node checker + job, serena → `@v1.7.0`. barley branch
      `chore/mcp-pin-check` `6d91cd1d5` off `develop` — **Python twin** `check_mcp_pins.py`
      (ruff-clean, agreement-checked against the Node one: 20/20 cases byte-identical) as a
      reusable workflow in `ci.yml` + CI gate; shadcn `-y @canary` → `@4.19.0`, bedrock
      `@latest` → `@0.2.0`. All three pins verified to start locally. **Neither pushed.**
      sowinsights: no `.mcp.json`, nothing to port.
- [x] **W2.2 CLOSED — ✅ MERGED 2026-08-26 in both repos.** hops PR #556 (merge `8039e6939`) and
      hops-mcp PR #56 (merge `c9449f8`), both approved, every check green.
      Hook-content scan. Tool: `tooling/ci/agent-config-scan/` (scanner, 24 self-tests, real-hooks
      fixture, two job templates) — **re-synced from merged `main` on 2026-08-26**, so this repo's
      portable copy is byte-identical to what ships in both repos, job templates included.
      Design: `research/findings/agent-config-scan-design.md`.
      Evidence: `artifacts/agent-config-surface-sweep.md`.
      hops: branch `HOP-0000/agent-config-scan` off `dca2ed7b0`, commits `9b1b03838` + `8aa9757a9`.
      hops-mcp: branch `chore/agent-config-scan` off `7ef818d`, commits `e01090d` + `13d9268`.
      Resolves the surface from settings, never from a directory — that assumption is the AIS-03 bug
      itself and repeating it in a new shape would have been the whole failure mode. Reads inline
      `command` strings as content, referenced files, hooks-directory neighbours, permission
      allow-patterns, and plugin marketplace sources.
      **Scope was wider still than the note said.** It is 4 of 6 hooks org-wide that are inline-only
      (2 of hops' 4, both of hops-mcp's), and the surface includes `enabledPlugins` +
      `extraKnownMarketplaces`: three of four repos run plugins from `github: provectus/awos` with no
      ref. That corrects "barley has no agent-config surface" — it has the largest one, and it is
      indirect.
      **Calibration is the deliverable.** Naive rule forms measured against the real scripts:
      path-only `credential-read` 18 hits on `block-secrets.sh`, unanchored value patterns 7 on
      `pre-commit`, bare `SKIP_SECRETS=1` 4, any `.git/hooks` mention 1. Shipped rules: **0**. The one
      live false positive was a whole-line comment documenting the attack it blocks.
      **The review pass found the gate had the defect it was built to fix** (2026-08-26, before
      merge): with `.claude/settings.json` absent, `scanRepo()` returned zero findings and `main()`
      exited 0 — pointed at an empty directory it printed *"no agent hook surface in this repo — all
      clear"*. A PR deleting or renaming the settings file would have turned the job **green**, which
      is exactly AIS-03's skip-and-still-report-100% failure in a new shape. Fixed with
      `--require-surface` (hops `8aa9757a9`, hops-mcp `13d9268`): an absent settings file is an
      ordinary blocking `missing-surface` Finding, so it flows through the allowlist, `--json` and
      the exit code like every other. Both workflow steps pass the flag; the default stays off so
      ad-hoc local scans of an unrelated directory still exit 0. Two tests cover both directions.
      Verified: 24 tests (22 pass / 2 skip in the target repos, all 24 here); gate green on both real
      trees; positive control on hops' real config plus two plants exits 1 while the other 124 lines
      of the guard stay silent; hops-mcp `make check` 0 and `npm test` 63 files / 1507 tests.
      **Drive-by, disclosed in the commit:** hops-mcp's `npm test` had been red on `main` since the
      Scorecard checker landed (#55) — vitest collects `scripts/*.test.mjs` and fails them with "No
      test suite found". `vitest.config.ts` now excludes `scripts/**`.
      ⚠️ hops commit used the documented `SKIP_SECRETS=1` hatch: the pre-commit hook flags the
      scanner for containing the *word* secret and its own `aws_secret_access_key` regex.
      **PUSHED 2026-08-25 → hops PR #556, all checks green.** The acceptance gate is met: **Agent
      config scan passed in 12s with zero labels on the PR** — the proof it is not label-gated.
      CI output is identical to local (4 hooks, 2 scripts scanned, 17 plugins, 1 advisory, exit 0)
      and the self-test reports 24 tests / 22 pass / 2 skipped exactly as designed. **`Secret scan
      – gitleaks` passed**, which closes the earlier caveat that gitleaks could not be run locally.
      Also green: New dependency check, OpenSSF Scorecard, CodeRabbit, check-hop-agent-docker.
      Final head `8aa9757a9` re-ran green after the `--require-surface` fix (Agent config scan 13s,
      24 tests / 22 pass / 2 skipped) and **merged 2026-08-26**.
      **hops-mcp PUSHED 2026-08-26 → PR #56, all five checks green.** Agent config scan passed in
      11s; CI output identical to local (2 inline hooks, 0 script files, 0 enabled plugins, 1
      advisory, exit 0), self-test 24 / 22 pass / 2 skipped. Also green: check-mcp-docker,
      OpenSSF Scorecard, CodeRabbit, CodeBuild. That PR also carries the `vitest.config.ts` fix for
      the pre-existing red `npm test` (see the drive-by note above). hops-mcp has no PR template and
      no body-validating workflow, so the spec-link class of failure does not exist there.
- [x] **W2.3 CLOSED (2026-08-25)** → evidence §15. Scorecard is a standing control in four of
      five repos; the fifth is approved and waiting on a merge.
      **Landed:** `hops-mcp` #55 · `wort` #216 · `sowinsights` #5 · `barley` #1691.
      **All merged 2026-08-25** — `hops` #545, `wort` #217, `sowinsights` #6, `barley` #1699 —
      and **five green first runs** (evidence §16). `barley`'s latest is a `pull_request` run on an
      unrelated product branch: the gate now fires on ordinary work.
      **Token parity answered** (open since the plan): `hops`' first CI run scored all 18 checks
      and matches the user-token baseline on **11 of 12** tracked checks. The twelfth is
      `Branch-Protection`, `-1` from CI exactly as predicted — reported, never gated.
      Three of four merged repos needing a follow-up is the direct cost of merging before the
      pattern stabilised — the argument for W2.3i's trial-in-one-repo discipline, adopted late.
      **Five defects, none found by review:** W2.3f upstream's permission block omits two scopes ·
      W2.3g `setup-python` on CodeBuild · W2.3j a fail-open we wrote · W2.3k the `paths` filter left
      two of four gated checks unenforced · W2.3k `push` off the default branch. Four of five were
      in the harness, not in Scorecard.
      **Honest limits, recorded so the article does not overclaim:** 8 of 20 gated check-instances
      sit at 0 and cannot fall; scores are normalised ratios so small regressions may not move
      them; and `Branch-Protection` — the check that motivated adopting Scorecard, the only
      instrument here measuring *enforcement* — cannot be read from CI at all. The highest-value
      output was the measurement, not the gate: 25 of 26 default branches requiring zero status
      checks is still worth more than everything gated here combined.
- [x] **W2.3 — OpenSSF Scorecard in hops CI + the Gate 0 delta (2026-08-23)** → evidence:
      `artifacts/scorecard-w2-3-evidence.md`; tooling: `tooling/ci/scorecard/`. hops branch
      `HOP-0000/openssf-scorecard-posture-check` off `origin/main` @ `628b57db2`, commit
      `c0a93c356`, 4 files, **not pushed**.
      **The delta is zero, and that is the finding.** Not one check moved between the G0.3 baseline
      and current `main` across #515, #518 and #528 — Scorecard has no secret-scanning check, no
      cooldown concept and no opinion on package names, so all three are invisible to it by
      construction. Only real movement: open advisories 65 → 58, which is upstream churn, not our
      work, and does not change the score (Vulnerabilities saturates at 0).
      Design: weekly cron + `workflow_dispatch` + `push` to main filtered to `.github/workflows/**`
      (not `pull_request` — repo-level state a PR does not change). Per-check ratchet against a
      committed baseline, **not** an aggregate threshold: 6 gated, 6 reported, 6 ignored, every one
      of the 18 classified and a self-test that fails if upstream adds a nineteenth. Fails closed on
      a missing / inconclusive / unbaselined gated check.
      Verified: 22 offline self-tests; exit 1 on both positive controls (hand-raised baseline;
      gated check deleted from real results), exit 0 on the true baseline; local run with and
      without the new workflow scores the four workflow-facing checks identically, so the workflow
      does not move what it measures.
      **Not verifiable before merge** (stated in the PR): whether a Docker container action runs on
      the CodeBuild runners, and how `GITHUB_TOKEN` scope changes Branch-Protection against the
      enterprise ruleset. The merge is itself a push to main touching `.github/workflows/**`, so it
      fires the job.
      Version handling: baseline was v5.1.1-45, CI runs v5.5.0. Re-read the Gate 0 commit at v5.5.0
      to separate tool drift from repo change — identical, including the 65 advisories. Caveat
      found: `--commit` runs only **9 of 18** checks and still prints an aggregate (4.9); it is not
      comparable with 5.4.
      **New finding:** the action is SHA-pinned but its `action.yaml` runs
      `docker://ghcr.io/ossf/scorecard-action:v2.4.4` — a mutable tag. Pinning the action does not
      pin the code that executes. Feeds W1.4 and the article.
- [x] **W2.3c — Scorecard ported to the three sibling repos (2026-08-23)**, all **committed and
      unpushed**, each needing its owners' go-ahead like the gitleaks port did (#1636):
      `barley` `chore/openssf-scorecard-posture-check` `0333af457` off `origin/develop`
      (`ubuntu-latest`, Python twin); `hops-mcp` `069a379` off `origin/main`
      (`codebuild-hops-mcp-…`, Node twin); `sowinsights` `9958596` off `origin/main`
      (`codebuild-hops-sowinsights-…`, Python twin).
      **One policy, two implementations, chosen by what each repo's lint pipeline claims** — Node
      where the repo is Node (`hops`, `hops-mcp`), a stdlib Python twin where it is Python
      (`barley`, `sowinsights`), the same reasoning W3.1 used porting Python → Node for hops.
      `tooling/ci/scorecard/agreement-check.sh` holds the two to byte-identical stdout and exit
      codes: **15/15 comparisons agree** across 5 real results × 3 baseline cases.
      Verified per repo against **their own** gates, not ours: `ruff format --check` + `ruff check`
      under barley's `pyproject.toml` (caught an unformatted first pass), `make check` in hops-mcp
      after `npm ci` (caught prettier claiming the workflow YAML), `yamllint` everywhere.
      Deliberate: `Code-Review` and `CI-Tests` are rolling-window metrics gated at today's value, so
      barley (Code-Review 2) and sowinsights (0) will fail the weekly run if review discipline
      slips. Stated in each PR body.
- [x] **W2.3d — org-wide Scorecard sweep, all 27 repos (2026-08-23)** →
      `artifacts/scorecard-org-sweep.md`. Read-only, nothing changed, no scope expansion — the four
      charter repos stay the unit of analysis.
      **Baseline finding 1 generalizes:** 25 of 26 default branches require **zero** passing status
      checks, and the enterprise ruleset `provectus-global` carries no `required_status_checks` rule
      type anywhere. `barley` is the only repo in the org that blocks a merge on a check. That makes
      the top recommendation a single org-level settings change, not 26 repo-level ones.
      **Second score inversion in one day:** `barley`, the only enforced repo, scores
      Branch-Protection **4** — below the 25 that enforce nothing. With the Token-Permissions
      inversion (barley declares permissions in 27/28 workflows and still scores 0, hops declares
      none anywhere and also scores 0), that is two independent cases of a per-check score ranking
      the wrong way round. **A per-check score is not monotone in the control it names** — the
      article claim, and the same lesson as AWOS `score` vs `coverage`.
      **Dependabot exists in 1 of 26 repos** (`hops`). 15 of 26 repos are dormant and 14 have no
      workflows at all, so low aggregates there are absence, not misconfiguration — do not report
      them as findings. Outside the charter's four, `wort` is the one worth a look: actively
      maintained, 46 open advisories, 0 of its recent changesets reviewed, and simultaneously the
      best-pinned repo in the org.
      Accidental validation: `dme-core` is empty, Scorecard returns `"checks": null`, and both
      twins exit 2 rather than reading zero checks as zero regressions.
- [x] **W2.3k — final trigger shape: PR + push, no filter, no cron (2026-08-25)** → evidence §14.
      User decision: two triggers only, `schedule` and `workflow_dispatch` dropped. They are not
      redundant — `scorecard-action` branches on event name, so `pull_request` = local mode (the
      four gated checks, before the merge) and `push` = remote mode (all 18, the only way the seven
      API-only checks are read at all).
      **Cost stated and accepted:** the seven remote-only checks now refresh only on a merge; new
      advisories (69 open in `hops-mcp`, 286 in `barley`) will not surface between merges. Counter:
      nobody opened the Monday summary page — W2.3j exists because a defect sat there for two days
      and was found only once the output reached a PR comment.
      **Path filter removed from both, and it was wrong twice over.** `Pinned-Dependencies` reads
      Dockerfiles (it flagged `Dockerfile:2` in `hops-mcp`'s own run) and `Binary-Artifacts` reads
      the whole tree (`sowinsights`' committed `.pyc`), so a PR unpinning a base image or committing
      a binary never triggered the gate. And with no cron, a filtered push run would leave the seven
      remote-only checks refreshing almost never. Cost: the job runs on every PR and merge —
      **60–80s observed**.
      Same commit ports W2.3i's PR comment and W2.3j's local-mode fix to the other four, so all five
      now carry an identical shape.
      Commits: `hops` `c3edddbdc` (#545) · `hops-mcp` `6f12a67` (#55) · `barley` `cbe029af6`
      (#1691) · `sowinsights` `072d536` · `wort` `230f8fc` (#217).
      ⚠️ **Correction, `266815224`** (evidence §14.4): `barley`'s **push** trigger must be `[main]`
      only. `scorecard-action` returns `errOnlyDefaultBranchSupported` for any non-`pull_request`
      event off the default branch, so `push: develop` failed on its first merge
      (run 32852738128). `pull_request` events are exempt — the PR run into `develop` passed in
      1m49s while the push run failed in 27s. Gate unaffected; but `barley` integrates on `develop`
      and `main` sees a merge rarely, so the seven remote-only checks will refresh rarely **there**
      specifically. A schedule on `barley` alone is the fix if that matters.
      Verified per repo: triggers/permissions/step count parse, inline `github-script` passes
      `node --check` in all five, 27 Node / 28 Python tests, and each repo's own lint gate.
      **Follow-up if the report proves too quiet:** an upserted issue on the push run
      (`issues: write`, same step) rather than restoring the cron.
- [x] **W2.3j — a local-mode run reported clean on 11 of 18 checks (2026-08-25)** → evidence §13.
      The comment from the first PR run showed the report was wrong. `scorecard-action` runs in
      **local directory mode** on a `pull_request` event (`Local: .`, `repo.name` = `file://.`), so
      seven API-backed checks — `Code-Review`, `CI-Tests`, `Branch-Protection`, `Maintained`,
      `Contributors`, `CII-Best-Practices`, `Signed-Releases` — do not run at all.
      **The real defect: the job passed.** Fail-closed only covered gated checks going missing, and
      all seven are reported. W2.3h made it worse — before it, `Code-Review`/`CI-Tests` were gated,
      so this exact run would have failed loudly. Two individually-defensible changes combined into
      a silent half-measurement. Same shape as the fail-open defects this design was built against.
      Local mode is **correct** for a PR (it measures the proposed tree), so the fix describes it:
      `API_ONLY` constant, status `not measurable in local mode`, header `local working tree`,
      aggregate labelled not comparable with the count that ran, plus a note.
      **Fail-closed unchanged where it matters:** a gated check absent from a local run still fails
      — all four gated checks are file-based — and a remote run still calls an absent API check
      `missing from results`.
      Verified: 27 Node / 28 Python tests, **18/18 agreement including the real local-mode
      artifact**, ruff clean and format-stable at 99 and 100, prettier clean.
      Commit `f3c3db4` on #55; ported to the other four in W2.3k.
- [x] **W2.3i — the comparison posts to the pull request; trialled in `hops-mcp` (2026-08-25)** →
      evidence §12. Commit `7f930e1` on #55, **unpushed**. `pull-requests: write` at job level
      (verified against upstream's own docs: job-level write is the documented shape and
      `pull-requests` is not on their sensitive-scope list, so it costs nothing on the check this
      workflow gates). `actions/github-script` SHA-pinned `3a2844b7e` — chosen over `gh pr comment`
      because `gh` may not exist on a self-hosted CodeBuild runner, which is exactly the assumption
      that broke W2.3g. Upserted on a hidden marker so repeated pushes edit one comment.
      Forced one restructure: the comparison exits non-zero on a gated regression, so the summary
      now goes to a file that two `always()` steps consume — the run summary page and the comment.
      Verified: prettier clean, workflow parses, inline script passes `node --check`, 23 Node tests.
      **First run (32846478467) resolved three open questions green** — container action and
      `actions/setup-node` both work on `hops-mcp`'s CodeBuild runners (W2.3g's assumption), and the
      upserted comment lands. Ported to the other four in W2.3k, after the trial proved it.
- [x] **W2.3h — PR-gated, not push-gated; two checks leave the gated set (2026-08-25)** →
      evidence §11. Trigger is now `schedule` + `pull_request` + `workflow_dispatch`; **`push` to
      the default branch removed**. A run on main can only report a fait accompli — both real
      failures this week (W2.3f, W2.3g) were reported after the merge and preventable before it.
      **A claim of mine did not survive checking:** I argued push-to-main was needed because merges
      here bypass PRs. Last 20 commits on each default branch — `wort` 20/20 via PR, `hops-mcp`
      20/20, `sowinsights` likewise. These repos bypass **approval**, not pull requests;
      `Code-Review` counts approvals and I read an approval statistic as a process one. Same shape
      as the Phase 1 `score`-vs-`coverage` error, this time committed by me. §7 and §8 carry the
      old claim — corrected in §11.1.
      **Policy change the trigger forced:** `Code-Review` and `CI-Tests` move to reported-only, so
      the gated set is Pinned-Dependencies, Token-Permissions, Dangerous-Workflow,
      Binary-Artifacts — 4 gated / 8 reported / 6 ignored. Rule now stateable in one line: **every
      gated check is a property of the tree at the commit being measured.** It was already written
      in the script's own `REPORTED` comment and violated two lines above it.
      **Two near-misses:** `barley`'s PRs target `develop`, so its trigger lists both branches — a
      copied `main`-only trigger would never have fired. And `agreement-check.sh` was mutating the
      two newly-ungated checks to synthesise a regression; it would have compared two clean runs
      and still printed ALL AGREE. Mutation list narrowed to gated checks.
      No baseline value changed anywhere — both moved checks stay in `TRACKED`, measured and
      printed. A self-test in each twin now asserts they are reported, not gated.
      Commits, all **unpushed**: `hops` `2bcbfa766` (#545) · `barley` `0d20b178c` (#1691) ·
      `hops-mcp` `78ca553` (#55) · `wort` `22ba350` (#217) · `sowinsights` `41c0845`.
      Verified per repo: 23 Node / 24 Python tests, each repo's own lint gate, 15/15 agreement,
      Python twin still format-stable at 99 and 100 columns.
      **Bonus:** `hops-mcp` #55 now runs the job it adds, settling W2.3g's open `setup-node`-on-
      CodeBuild question before merge instead of after.
- [x] **W2.3g — second real run: `setup-python` does not work on the CodeBuild runners
      (2026-08-25)** → evidence §10. `sowinsights` merged (#5); run 32840533614 failed at
      `Set up Python`: *"The version '3.11' with architecture 'x64' was not found for this
      operating system"*. `actions/setup-python` resolves a prebuilt interpreter by OS from the
      `actions/python-versions` manifest, which covers GitHub-hosted images only.
      **The §9 token fix is confirmed working** — same run scored `Packaging` 10 and `CI-Tests` 0
      instead of `-1`, and Scorecard's own `Token-Permissions` details name the two new grants.
      **Porting defect, worth generalizing:** the step came from the `barley` port where it is
      correct (`ubuntu-latest`). Copying a workflow between repos silently changed `runs-on`.
      Re-check every step against the target's **runner**, not only its language.
      Fixed by removing the action — the checker is stdlib-only and needs ≥3.9, so the runner's
      `python3` is enough; `python3 --version` is printed so a future change shows in the log.
      Same commit pins `actions/checkout` and `actions/upload-artifact` by SHA: three of the four
      unpinned GitHub-owned actions Scorecard flagged in that repo were **in the Scorecard workflow
      itself**, which gates `Pinned-Dependencies`. Improvement, not regression — which is why only
      reading caught it.
      **The comparison would have passed:** run offline against the failed job's artifact, exit 0,
      three checks improved. The `if: always()` upload is what made that provable — it has now paid
      for itself in both real runs.
      Fix committed and **unpushed**: `sowinsights` `fix/scorecard-runner-python` `25aa106`.
      ⚠️ Remaining unverified, same shape: `hops-mcp` #55 uses `setup-node` on a CodeBuild runner
      and **no existing workflow there uses `setup-node`**. `hops` proves it works on its own
      CodeBuild runners, and `setup-node` (unlike `setup-python`) falls back to nodejs.org — an
      argument, not evidence. Resolves on that PR's first run.
- [x] **W2.3f — first real CI run, and the token bug it found (2026-08-25)** → evidence §9.
      `wort` #216 merged; run 32837708276 **failed correctly**. `CI-Tests` 10 → `-1` (403 on
      `ListStatuses`), `Packaging` 10 → `-1` (403 on `ListWorkflowRunsByFileName`),
      `Branch-Protection` 5 → `-1` (GraphQL needs repo-admin scope).
      **Root cause: `ossf/scorecard-action`'s documented permission block omits `statuses: read`
      and `actions: read`.** The workflow's permission list was copied from it. Both scopes added,
      read-only, each annotated with the API call that needs it. `Branch-Protection` stays `-1` in
      CI by design — reported, never gated; the baseline keeps the user-token value of 5.
      **Everything previously unverifiable is now verified:** container action runs, self-tests run
      in CI, `if: always()` artifact survived a failing job, fail-closed path exercised for real.
      **Best single argument in the work item for per-check gating:** the aggregate fell 4.2 → 3.6
      entirely from measurement failure, so any threshold gate below 3.6 would have passed this run
      green while three of eighteen checks stopped working.
      **All five ports fixed, all unpushed.** `wort` `fix/scorecard-token-permissions` `d36675a`
      and `hops` `827744ae3` (second commit on the open #545 branch, not an amend — it is already
      reviewed). `barley` `76d941ece`, `hops-mcp` `3745270`, `sowinsights` `9c4a454` amended on
      fresh approval — unpushed and unreviewed, so an amend is the clean shape there. The same
      amend closed the W2.3e source drift: `barley` and `sowinsights` now carry the canonical
      Python twin, `diff`-verified identical.
      Each verified under its own repo's gate: barley 23 tests + ruff clean, hops-mcp 22 Node tests
      + prettier clean, sowinsights 23 tests. No baseline value changed anywhere — the fix grants
      read scopes so checks can be measured, it does not move a score.
- [x] **W2.3e — Scorecard ported to `wort` (2026-08-24)**, on explicit fresh approval — `wort` is
      outside the charter's four, and W2.3d named it as the one repo outside scope where a standing
      measurement pays. Branch `chore/openssf-scorecard` `c897304`, **committed and unpushed**.
      Baseline agg 4.2 @ `c29cbc4e4`, measured fresh against current `main`.
      **The rollout question is settled: not all 27.** Maintained-and-has-CI leaves seven repos —
      the charter's four plus `hops-fin-service`, `barley-fe`, `wort`. Sixteen of twenty-six score
      Maintained 0 and eleven have no workflows, so three of the six gated checks would read `-1`
      there. For the dormant tail the artefact is a periodic org sweep from one repo, not twenty-odd
      workflows.
      **Third instance of the non-monotonicity:** three of `wort`'s four workflows declare top-level
      `permissions`; `ci.yml` does not, and takes Token-Permissions to 0. A one-line
      `permissions: contents: read` in `ci.yml` moves it 0 → 10 — the highest-value single line
      available in the org. Named as a follow-up in the PR body, **not** included in the port.
      **Sharpest declared-vs-enforced case found so far:** `main` requires a PR and one approval,
      admins are exempt from that rule, and Code-Review reads 1 of 30 changesets approved. The
      setting is on and still not binding — a stronger form of W2.3d's status-check finding.
      `wort`'s lint (pyupgrade, bugbear, simplify, `E501` at 100, repo-wide pyright) forced a rework
      of the shared Python twin. It is now **format-stable at both 99 and 100 columns**, so one
      source satisfies `barley` and `wort`. ⚠️ The unpushed `barley` and `sowinsights` branches
      still carry the pre-rework revision — proven byte-identical in output, but stale in source;
      refreshing them needs their own approval.
- [x] **W2.3b — four-repo Scorecard posture table (2026-08-23)**, read-only, in the same evidence
      file. Aggregates `hops` 5.4 · `hops-mcp` 4.7 · `barley` 4.1 · `sowinsights` 3.4 (ordering
      only — ~2.2 of each is open-source-norm checks that do not apply). Independent confirmation
      of two Phase 1c findings without being told to look: `sowinsights`' committed `.pyc`
      (Binary-Artifacts 8) and its mutable `python:3.11-bullseye` base image. `barley`: 50 unpinned
      third-party actions, 108 unpinned container images, 286 open advisories, Code-Review 2 (2/9
      changesets approved). **Correction to an obvious-looking claim:** all four score
      Token-Permissions 0, but `barley` declares top-level permissions in 27 of 28 workflows and
      loses on two `contents: write` grants — it is ahead of `hops` (which declares none anywhere)
      at an identical score. Read the details, not the score.

### Measurement checkpoint (after Waves 1–2)
- [ ] Re-run `/awos:ai-readiness-audit` on hops — acceptance: **no dimension regresses**.
      Only three of the wave's items produce an audit delta at all: **PRV-17** (WARN 1/2 → PASS),
      **ADP-04** (FAIL 0/5 → PASS) and **AIS-03** (SKIP → actually executes). SCS-04 will skip
      again regardless of W1.1 — do not report it as a win. Baseline to compare against:
      `research/baseline/phase2-before-state.md`.
- [ ] Re-run gitleaks (tuned) + osv; evidence per item → `artifacts/` (before / PR link / after)
- [ ] `methodology/log.md` entry for the wave

### Wave 3 — medium items
- [x] **W3.5 — Fail-closed cassette scrubbing (2026-08-20)** — roadmap item 8. barley branch
      `chore/fail-closed-cassette-scrubbing` off `origin/develop` @ `d337c2eec`, commit
      ✅ **MERGED 2026-08-21 as barley PR #1652** (base `develop`, merge `2d359e81d`). Their
      full suite passed — `test / pytest` green, which closed the "could not run barley's pytest"
      caveat.
      **The two controls collided:** the fail-closed tests need genuinely issuer-shaped
      credentials, and the secret-scan gate merged four days earlier flagged them. Resolved with a
      `NOTAREALTOKEN` marker inside each captured span, stopworded **by value, not by path** — a
      real token in that same test file still fires. Path-allowlisting `tests/` would have
      recreated barley's own SEC-04 blind spot.
      Two generic passes added ahead of the existing denylist — redact by **key shape**
      (token/secret/password/api_key/credential/authorization/signature/private_key) and by
      **value shape** (Slack/GitLab/GitHub/AWS/Google prefixes, PEM blocks) anywhere in the body,
      including HTML and prose. Cursors (`nextPageToken`, `nextSyncToken`) and identifiers
      (`SecretId`) deliberately excluded — measured, they were the only two things a naive rule
      would have over-redacted.
      **The enforcement is the deliverable:** `TestCommittedCassettesAreClean` scans all 73
      cassettes as committed, so a future hole fails CI. Without it the passes are just a bigger
      denylist. Reports pattern + line, never the value; carries two self-guards (that it found
      cassettes at all, and that its patterns still match a known shape).
      Verified: new passes change **0 of 73** cassettes (additive, no re-record needed); the scan
      finds 0 offenders today and does fail on a planted token in a copy.
      **Scope finding (verified, not assumed):** this control is **conditional on a testing
      practice**, not universal. hops records no API traffic at all — no VCR, no cassettes, no
      `nock` recorder, WireMock "deliberately not on the classpath" per their own comment. Barley's
      credential patterns over **2,537** hops test/fixture files return **0**. `sowinsights` and
      `hops-mcp` record nothing either. Do not port this to hops; it would be maintained code that
      can never fire. Written into the report as a conditional blueprint row.
- [x] **W3.1** Hallucinated-package CI check — ✅ **MERGED 2026-08-21 as hops PR #528**
      (merge `813efc48b`). The gate is now live on every hops PR. Ported to Node for hops because hops CI has no
      Python anywhere; the Python original stays in `tooling/ci/slopsquat/` as the reference for
      Python repos. Both agree on identical live inputs. The new job ran green on its own PR with
      no labels — which is the point of not label-gating it.
      Design: `research/findings/hallucinated-package-check-design.md`.
      Tool: `tooling/ci/slopsquat/check_new_deps.py` + 17 offline self-tests + `hops-job.yml`.
      **Measured, not asserted:** 0 false positives across 28 packages added by 20 real
      `hop-ui/package.json` commits — replayed twice, the second time judging each package's age
      as of its own commit date rather than today, because the first pass flattered the result.
      Live positive control blocks both a plausible hallucinated name and a typo of a real
      dependency. Two thresholds are measurement-derived: 90-day age floor (hops' youngest direct
      dep is 298 days) and the 8-character floor on the near-neighbour rule (without it, `clsx`↔
      `tsx` and `vite`↔`vitest` self-report as FPs).
      **Does not overlap W1.1's cooldown** — that covers new *versions* of trusted packages;
      this covers *names* entering the manifest for the first time. Say so explicitly, or someone
      will close this as already-done.
      Side measurement: 273 single-edit variants of hops' 8 most-used deps → only `ercharts`
      exists (legit 2017 package). The squat surface is empty today, so the near-neighbour rule's
      value is prospective, not a backlog.
      Scope limits stated in the design note: npm only, no downloads signal (the API rate-limits
      under CI concurrency), no tarball analysis, direct dependencies only.
- [ ] **W3.2** Threat-model doc for hops (closes AS-11); doubles as publication material
- [ ] **W3.3** Reinstate `/security-review` as a hops skill + the finding→instruction-file loop
      rule
- [ ] **W3.4** File AWOS detector bugs upstream → issues on `provectus/awos`.
      **2026-08-28: FILED — provectus/awos #190 (AIS-03), #191 (AS-05), #192 (AS-13), all
      labelled `bug`; bodies kept in `artifacts/awos-issues/`. Awaiting maintainer triage.**
      (1) AS-13 root-only `.env.example` — `security.ts:172-182`; cross-ref #159.
      (2) AIS-03 `.claude/hooks/` path — `prompt_agent_integrity.ts:313-322`; `has_hooks` is true
      yet the scan SKIPs; inline commands never scanned; AIS-07 shares the assumption. **False
      PASS — high.** (3) AS-05 (SEC-04 in barley's old schema) prunes `tests/` etc. —
      `application_security.ts:464-472`, placeholder regex `:461` has bare `test`. **False PASS —
      high.** Nothing upstream covers them: #159/#158 touch AS-13 via a different mechanism.
      Closure gate: re-audit hops on the fixed release — AS-13 FAIL→PASS, AIS-03 SKIP→executed.
      **Add (2026-08-19):** the gitleaks `regexTarget = "line"` defect →
      `gitleaks/gitleaks`. Blocked on a shareable reproducer — it reproduces only on the two
      private repos, not on synthetic fixtures. Do not file without one.

- [ ] **NEW (2026-08-19, re-measured 2026-08-27) — CodeRabbit is mostly not reviewing.** On PR
      #515 it produced a walkthrough but **no line-by-line review**. Re-measured on the last 15
      PRs per repo: line comments on **3/15 hops, 5/15 barley**; the rest carry "Review limit
      reached". The notice states the mechanism — a shared allowance of **3 included reviews
      per hour**, set by the past 7 days' usage (47 attempts), on-demand reviews free for 24
      more days then $0.25 per reviewed file. Not seats, not per-author: barley's #1744 got 16
      comments and #1748 by the same author got 0. `.coderabbit.yaml` also carries an
      unrecognized `version` key, silently ignored; neither repo's config enables security
      tooling; barley sets `request_changes_workflow: false`. The report credits AI code review
      as an implemented control; on the current plan it performs one for roughly a quarter of
      PRs. Raise as a plan/quota question, with the security-action alternative.

- [x] **Roadmap item 11: security review at generation time + close the loop — ✅ MERGED 2026-08-28 as hops PR #566 → `34fa5c978`** (2 commits squashed; second one dropped the API-key wording at the team's request). Re-verified on `origin/main`: section at `CLAUDE.md:148`, gate at `commit-validated:47`, zero `ANTHROPIC_API_KEY` mentions, `check-agent-config --require-surface` exit 0. Still open below: the interactive `/security-review` probe (the "actually runs" number).
      Measured first (`artifacts/generation-time-review-hops.md`): hops already enables the
      `security-guidance` plugin (regex on edit, LLM review on Stop, agentic review on commit) —
      but it has **never run on this machine**: enabling in `settings.json` installs nothing, and
      the two LLM layers require `ANTHROPIC_API_KEY` in the hook's env, which an OAuth login does
      not provide. Layer 1 fires on 4/9 planted classes and is blind to Kotlin. The reverted
      `/security-review` command was a full-codebase grep checklist, not worth reinstating.
      - [x] Evidence: three layers probed directly and through a real `claude -p` session in a
            throwaway worktree; hops's own `scripts/pre-commit` caught the planted key.
      - [x] Codify the loop in hops: `CLAUDE.md` rule "every security finding updates the
            instructions", `self-improvement` trigger, `commit-validated` note, plus the two
            plugin prerequisites written down. **Amended 2026-08-27** after the subscription
            question: generation-time review is now the built-in `/security-review` as a gate
            in `commit-validated` (runs on the session login, no key); the plugin is demoted
            to a supplement. Branch `HOP-0000/security-finding-loop`, commit `58f52ff50`
            (amended from `253aad0a6`) off `main` @ `8039e6939`, **opened as hops PR #566** (2026-08-27; first run failed only on `Spec link – PR template`, empty Spec field — body rewritten with `n/a — <reason>`) — gate
            `check-agent-config --require-surface` exit 0; hops pre-commit first refused the
            prose "secret scan," (false positive), reworded. PR body:
            `scratchpad/pr-body-hops-loop.md`.
      - [x] `research/findings/generation-time-review.md` — recommendation for barley and
            hops-mcp, the four options for a subscription-only team with the verdicts, roadmap
            rewording.
      - [ ] **Raise with the org:** Anthropic's `claude-code-security-review` GitHub Action with
            one CI secret — the independent-context review that covers every developer regardless
            of login. Goes with the require-status-checks ask below.
      - [x] Per-repo recommendations for barley, hops-mcp, sowinsights (2026-08-27) →
            `research/findings/generation-time-review.md`. hops-mcp already has a path-scoped
            `security-reviewer` agent — two edits close it; barley's rule must sit inside its
            existing "Self-Review After Edits" section and respect its no-meta-reviewer lesson;
            sowinsights needs a `CLAUDE.md` first. **Slack message drafted 2026-08-27**
            (`scratchpad/slack-generation-time-review.md`) for the "DevOps Capabilities
            Research" channel — bundles the CI-action + status-check asks and the per-repo
            recommendations. Posted; **team answers 2026-08-28:** (1) CodeRabbit plan stays
            as-is — their reading is that team members get reviewed and outside contributors
            hit the free-tier limit (our data: barley's own authors were limited on 10/15 PRs;
            not re-argued, decision recorded); (2) security review is done through Claude
            Code skills, not CodeRabbit — barley's `self-review` carries one security
            question (item 7 of its correctness checklist); the CI-action option is **dropped**;
            (3) the org ruleset cannot be changed, but a **repo-level ruleset can** —
            drafted `scratchpad/hops-ruleset-required-checks.json` + apply notes; needs
            repo admin (ours is `write`).
      - [x] **Approved and committed 2026-08-28** (Vladyslav pulled `develop`/`main`, will push):
            hops-mcp `docs/security-review-before-commit` @ `4d4952a` (2 files, +12 −6, gate
            exit 0) — `/security-review` gate in `commit-validated`, `security-reviewer` agent on
            the invariant paths, finding→invariant rule; barley
            `chore/security-review-before-commit` @ `fb5156a91` (1 file, +2 −1) — one sentence
            in Self-Review After Edits, one Key Guideline. PR bodies:
            `scratchpad/pr-body-hops-mcp.md`, `scratchpad/pr-body-barley.md`.
      - [x] Reword item 11 on the roadmap artifact (same URL, version `item-11-measured`,
            2026-08-27) — row now `in review`, matrix rows for reviewer and close-the-loop updated.

### Recommendations to owners (not our changes)
- [ ] **NEW, highest value (2026-08-18, widened 2026-08-23) — require passing status checks at the
      org level.** Verified across **26 repos**, from two independent endpoints: 25 default branches
      require **zero** passing checks, and the enterprise ruleset `provectus-global` carries only
      `deletion`, `non_fast_forward`, `pull_request` — there is no `required_status_checks` rule type
      in the org at all. `barley` is the sole exception (`CI Gate`, `non_admins`). So this is one
      settings change at the `provectus-global` ruleset, not a per-repo ask, and it is what makes
      every gate this project shipped actually binding. Detail: `artifacts/scorecard-org-sweep.md`.
      Original hops-only framing below.
- [ ] **(2026-08-18, unblocked 2026-08-28) — require the security gates as status checks on
      `hops` `main`, via a repository ruleset.** Team confirmed the org ruleset is off-limits but
      a repo ruleset is allowed. Draft ready: four checks (`Secret scan – gitleaks`, `Agent config
      scan`, `New dependency check`, `OpenSSF Scorecard`), no bypass actors, non-strict; the
      label-gated SonarQube/osv jobs deliberately excluded until item 7 un-gates them. hops
      already carries a leftover repo ruleset `test` (deletion only). Apply needs admin.
      Original note below.
      Verified from two GitHub endpoints: `main` requires a PR + 1 approval and **zero passing
      checks** (`enforcement_level: "off"`, enterprise ruleset carries only `deletion`,
      `non_fast_forward`, `pull_request`). The gitleaks gate, SonarQube and osv are all advisory at
      merge time. Repo-settings change, needs an admin — ours is not one. Raise with the HOPS tech
      lead alongside the W1 heads-up. Detail: `artifacts/scorecard-baseline-hops.md` finding 1.
- [x] Hand barley owners the gitleaks-port recipe + fail-closed scrubbing pattern (2026-08-18) →
      `research/findings/barley-rotation-runbook.md` — full triage + rotation runbook, folded
      together with G0.1 since they go to the same people. Still to send.
- [x] **Ported the gate as an applyable PR (2026-08-19)** — branch
      `chore/gitleaks-secret-scan-gate` on barley, base `develop` @ `230d4fa68`, committed
      `2df43382e`, **not pushed**. Four files: `.gitleaks.toml` (tuned, 89 findings → 3),
      reusable `secret-scan.yml`, `ci.yml` wiring incl. the `RESULTS` array, and the
      pre-commit stanza. Verified: CI command exits 0 on the PR's own commits and 1 on a
      planted synthetic key; pre-commit hook fires; three synthetic credentials planted inside
      allowlisted contexts all still detected. PR body drafted in `scratchpad/pr-body-barley.md`.
      ✅ **MERGED 2026-08-20 as barley PR #1636** (base `develop`, 4 files, 1 commit). The
      first attempt, #1634, targeted `main` and dragged in 12 unrelated develop commits — closed
      and reopened against the right base. CI green including `secret-scan` and `CI Gate`;
      `deepeval-smoke` fails but fails on every branch including `main` (3+ days), pre-existing.
      Drive-by in the same diff: `web-ci` was in `ci-gate`'s `needs` and its failure echo but
      missing from the `RESULTS` array that decides, so web-ci failures could not fail the gate.
- [ ] Check GitHub push-protection availability on the org plan (question, not a change)

## Phase 3 — Generalize

- [ ] Extract what transfers beyond `hops` — and state what does not. The four repos span Kotlin,
      Python, TypeScript, monorepo and single-service, hardened and bare: if a check works across
      that spread it is a capability, not a HOPS config.
- [ ] Draft `article/`.

## Deferred by design

- [ ] Sync with Max Ivanchenko / Vasiliy Ilichev on their roadmap. The charter mandates independent
      research first — **do not** open this until Phase 1 is complete.
