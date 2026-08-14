# HOPS security baseline — verified 2026-08-14

Layer-by-layer inventory of what exists in `hops` today, verified against the working tree at
`main` (commit `0a5303371`). For each control: what it claims vs what it actually catches.
Cross-repo comparison lives in `cross-repo-matrix.md`; audit analysis in
`../findings/hops-audit-analysis.md`.

## Layer 1 — local (developer machine)

### `scripts/pre-commit` (168 lines, hand-rolled)
- **Claims:** blocks commits of suspicious files and credential-shaped content.
- **Actually:** two-step scan of staged files — filename pattern
  (`\.(env|pem|key|p12|pfx|keystore)$|credentials\.json|secrets\.ya?ml|…`) then content regexes.
  **Advisory only**: `SKIP_SECRETS=1` bypasses; nothing forces installation (`cp` to
  `.git/hooks/` is manual — though see the Claude `PostToolUse` hook below, which re-installs it
  for agent sessions).
- **Verified gaps:** filename pattern anchored `\.env$` — `.env.example` (fine, placeholder) but
  also `.env.production`-style names escape it; content step only sees staged files, no history.
- **Honest design:** the CI gate is documented (in `.gitleaks.toml`'s header) as the enforcement
  layer behind this advisory hook — the layering is intentional, not accidental.

## Layer 2 — agent-time (Claude Code)

### `.claude/settings.json` hooks
- **`PreToolUse`** on Read/Glob/Grep/Bash/Edit/Write/MultiEdit/NotebookEdit →
  `scripts/claude-hooks/block-secrets.sh`: blocks the agent from touching secret material at all.
- **`PostToolUse` (Bash)** → re-copies `scripts/pre-commit` into `.git/hooks/` — closes the
  "hook never installed" hole for any repo an agent works in.
- **Note:** hooks live in `scripts/claude-hooks/`, not `.claude/hooks/` — which made the AWOS
  audit's AIS-03 malicious-hook check skip them entirely (see audit analysis, blind spot 2).

## Layer 3 — CI (GitHub Actions, `.github/workflows/hops-mr-check.yml`)

| Job | Gating | Verified detail |
|---|---|---|
| `secret-scan` ("Secret scan – gitleaks") | **Unconditional** — comment in the workflow: "Not label-gated: a leaked token can land in any file of any PR" | gitleaks **8.24.3**, pinned binary, `fetch-depth: 0` (full history available to the scan) |
| `osv-audit-hop-ui` ("Security audit – hop-ui") | **Label-gated**: `if: contains(...labels..., 'frontend')` | Covers `hop-ui` only. `hop-agent`, `e2e`, `hop-backend` have **no** PR-time dependency audit |
| `sonarqube-check-mr` | On MR | SonarQube (self-hosted), quality + some security rules |
| detekt | via gradle build | `hop-backend/detekt/` — Kotlin static analysis |

### `.gitleaks.toml` (tuned config)
- Extends default ruleset; allowlist contains **verified false positives only** — one docs path,
  value-level regexes (PostHog public key, notebook UUIDs), `regexTarget = "line"` for context.
- Deliberately does **not** path-allowlist `.env.example` (reasoning documented inline: a real
  credential pasted over a placeholder must still flag; use value stopwords instead of path
  rules).
- **Verified effective:** worktree scan with this config = 0 findings; history scan with default
  config shows the last real-format leak predates the gate (2026-04); gate landed 2026-07-30 in
  response to audit finding R7/PRV-01.

## Layer 4 — dependencies / supply chain

| | State (verified) |
|---|---|
| Lockfiles | `hop-ui/pnpm-lock.yaml` (+ 3 more pnpm locks in subpackages), `e2e/` + `hop-agent/` `package-lock.json`. `hop-backend`: `gradle/libs.versions.toml` version catalog — direct versions pinned, **no gradle lockfile / verification-metadata for transitives** |
| Pinning | Audit SCS-03 PASS: 115/121 direct deps exact-pinned; 6 ranged, all in tiny internal tool packages |
| Updates | Dependabot: npm ×3, gradle, github-actions (`.github/dependabot.yml`) — with human review (SCS-05 PASS) |
| Known weak spots | 121 direct npm deps (SCS-08 WARN — attack surface); dependency *audit* at PR time only for `hop-ui` and only when labeled |

## Layer 5 — process / human

- `.coderabbit.yaml` — AI review on PRs (tuned for Tailwind v4 FPs).
- `docs/processes/security-notes.md` — **accepted-risk register** with reasoning (AS-01
  transport, AS-09 rate limiting). Read before flagging anything.
- `docs/processes/code-review-guidelines.md`, mandatory AWOS workflow, `context/audits/` — five
  audit runs on record; audit findings demonstrably drive fixes (PRV-01→gitleaks in 13 days).

## Summary — what the baseline actually is

Defense-in-depth for **secrets** is real and layered (advisory local hook → agent-time block →
unconditional CI gate with tuned config), with the audit loop as the forcing function. The thin
spots, in scope for Phase 2: dependency auditing beyond labeled `hop-ui` PRs, transitive locking
for gradle, agent-config surface not declared security-sensitive (PRV-17), no threat-model doc
(AS-11), and the audit's own blind spots (AS-13, AIS-03 path assumptions).
