# Cross-repo security control matrix — BarHopping org

Verified 2026-08-14 against local clones. Every cell names the file that proves it.
Repos: `hops` (~5.8k files, Kotlin+TS monorepo), `barley` (~4.9k, Python+TS+TF),
`hops-mcp` (~284, TS MCP server), `sowinsights` (~33, Python PoC).

## Controls

| Control | hops | barley | hops-mcp | sowinsights |
|---|---|---|---|---|
| Secret scan — CI | ✅ gitleaks 8.24.3, `secret-scan` job in `.github/workflows/hops-mr-check.yml` | ❌ none in `.github/workflows/*` (27 workflows checked) | ❌ none in 3 workflows | ❌ none |
| Secret scan — local | ✅ `scripts/pre-commit` (advisory; `SKIP_SECRETS=1` bypass) | ❌ `.pre-commit-config.yaml` has no secret hook | ❌ | ❌ |
| Agent-time secret guard | ✅ `scripts/claude-hooks/block-secrets.sh` via `PreToolUse` in `.claude/settings.json` | ❌ (`settings.json` has no hooks) | ❌ (its one `PostToolUse` hook is tsc/eslint quality, not security) | ❌ no `.claude/` |
| Secret-scanner tuning | ✅ `.gitleaks.toml` (verified-FP allowlist only) | — | — | — |
| Pre-commit framework | ❌ hand-rolled `scripts/pre-commit` | ✅ `.pre-commit-config.yaml` (ruff, biome, **local regex PII scanner** `pii-scan-evals-datasets`) | ❌ | ❌ |
| Dependency audit — CI | ⚠️ `osv-audit-hop-ui`: `hop-ui` only, **only when PR labeled `frontend`** | ❌ | ❌ | ❌ |
| Dependabot | ✅ npm ×3 + gradle + actions (`.github/dependabot.yml`) | ❌ | ❌ | ❌ |
| Static analysis | ✅ SonarQube (`sonarqube-check-mr`), detekt (`hop-backend/detekt/`) | ⚠️ ruff/biome — lint, not security | ⚠️ eslint | ❌ |
| AI code review | ✅ `.coderabbit.yaml` | ✅ `.coderabbit.yml` | ❌ | ❌ |
| AWOS audits on record | ✅ 5 runs (newest `2026-08-03_19-15-15`) | ✅ 3 runs (newest `2026-06-03`, older md schema) | ❌ | ❌ |

## Supply-chain posture

| | hops | barley | hops-mcp | sowinsights |
|---|---|---|---|---|
| Lockfiles | ✅ npm/pnpm fully locked: `hop-ui/pnpm-lock.yaml` (+3 subpackage locks), `e2e/`+`hop-agent/` `package-lock.json`. ⚠️ gradle: `libs.versions.toml` catalog pins directs, no transitive lockfile | ✅ `poetry.lock` | ✅ `package-lock.json` | ❌ none |
| Pinning | mixed (unverified per-module) | poetry-managed | npm-managed | ❌ `requirements.txt`: **13 deps, 0 pinned** (`grep -c '=='` = 0) |
| Other | — | — | — | 2 compiled `.pyc` files committed (`app/__pycache__/`) |

## AI-assistance surface (counts, 2026-08-14)

| | hops | barley | hops-mcp | sowinsights |
|---|---|---|---|---|
| `.claude/agents` | 7 | 20 | 2 | — |
| `.claude/skills` | 24 | 32 | 9 | — |
| `.claude/commands` | 9 | 8 | 3 | — |
| Hook events in `settings.json` | 3 | 0 | 1 | — |
| MCP servers in `.mcp.json` | 2 | 5 | 2 | — |
| `.awos/` workflow | ✅ | ✅ | ✅ | ❌ |

## The correlation question (article thesis material)

`barley` has the **largest** AI surface (20 agents, 32 skills, 5 MCP servers) and **no secret
scanning at all** — while `hops`, with a comparable AI surface, has three layers of it. AI-assisted
development intensity does not predict security tooling; the tooling exists where someone
deliberately built it (the `hops` gitleaks gate traces to audit 2026-07-17 finding R7/PRV-01, per
the comment in `.gitleaks.toml`). Security here is audit-driven, not adoption-driven — and the
secret-scan results (`research/findings/secret-scan-2026-08-14.md`) show the difference is
measurable in leaked-credential counts.
