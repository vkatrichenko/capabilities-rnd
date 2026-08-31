# Roadmap item 11 — security review at generation time, measured on `hops`

Evidence for the "verify" half of item 11. All probes ran in a throwaway detached worktree of
`hops` at `main` @ `8039e6939` (`scratchpad/hops-sg-probe`, deleted afterwards, never pushed).
Plugin under test: `security-guidance@claude-plugins-official` **2.0.7**, Claude Code **2.1.247**,
python **3.14.7**, login via OAuth subscription (no `ANTHROPIC_API_KEY` in the environment).

## What the roadmap assumed vs what was there

Item 11 said *"reinstate `/security-review` as an org-wide skill (hops lost its command in a
revert)"*. Three corrections:

| Assumption | What the repo shows |
|---|---|
| hops lost its generation-time review in a revert | The reverted file (`4f9a02c31:.claude/commands/security-review.md`) was a full-codebase grep checklist bundled into an unrelated feature branch. Claude Code ships a built-in `/security-review` in every install; a repo copy duplicates it |
| hops has no generation-time review | `hops/.claude/settings.json` enables the `security-guidance` plugin — three layers: regex warnings on `Edit\|Write`, an LLM diff review on every `Stop`, an agentic multi-file review on `git commit`/`git push`. That *is* the control the roadmap asks for |
| Enabled means running | **It has never run on this machine.** The plugin creates `~/.claude/security/` on its first invocation; the directory does not exist. `claude plugin list` does not list it. A headless session in the worktree *without* `--plugin-dir` wrote `dangerouslySetInnerHTML` to `Probe3.tsx` with no warning and no log line |

## Layer 1 — regex pattern warnings (`PostToolUse` on `Write`)

Hook invoked directly with the same JSON Claude Code sends, `SECURITY_WARNINGS_STATE_DIR` pointed
at scratch so nothing touched `~/.claude`. One snippet per class the roadmap names as weakest for
AI-generated code, in the language hops actually uses for that layer.

| # | Class | File | Snippet | Layer 1 | hops SAST control |
|---|---|---|---|---|---|
| 1 | XSS | `hop-ui/src/x.tsx` | `dangerouslySetInnerHTML={{__html: userInput}}` | **hit** `react_dangerously_set_html` | eslint: `eslint-plugin-react` installed, `react/no-danger` **not enabled** in `eslint.config.mjs` |
| 2 | Code injection | `hop-ui/src/e.ts` | `eval(userInput)` | **hit** `eval_injection` | eslint: `no-eval` not enabled |
| 3 | Unsafe deserialization | `hop-sowa/y.py` | `yaml.load(body)` | **hit** `unsafe_yaml_load` | none (ruff is lint-only) |
| 4 | TLS off | `hop-sowa/r.py` | `requests.get(url, verify=False)` | **hit** `tls_verification_disabled` | none |
| 5 | SQL injection | `hop-backend/src/X.kt` | `"SELECT … WHERE name = '" + name + "'"` | miss | detekt: 153 active rules, **no security ruleset**; SonarQube: server-side rules, not inspectable from the repo |
| 6 | Hardcoded secret | `hop-backend/src/Cfg.kt` | `val apiKey = "sk-ant-api03-…"` | miss | **caught by `scripts/pre-commit`** (see below); gitleaks in CI |
| 7 | Path traversal | `hop-backend/src/F.kt` | `File(baseDir, request.getParameter("path"))` | miss | SonarQube only, unverified |
| 8 | SSRF | `hop-backend/src/S.kt` | `restTemplate.getForObject(request.getParameter("url"))` | miss | SonarQube only, unverified |
| 9 | Log injection | `hop-backend/src/L.kt` | `log.info("login for " + request.getParameter("user"))` | miss | SonarQube only, unverified |

**4 / 9.** The plugin's 25 regex rules cover JS/TS, Python and Go idioms; **none matches Kotlin**,
which is the language of `hop-backend`. Every Kotlin-side class the roadmap worries about goes
straight through layer 1. (Rule list: `hooks/patterns.py`, `ruleName` keys.)

Real-path confirmation: `claude -p --plugin-dir <plugin> --permission-mode acceptEdits` in the
worktree, asked to write a component using `dangerouslySetInnerHTML`. Log: `Pattern matches for
…/Probe2.tsx: ['react_dangerously_set_html']`; the model's reply: *"the security hook flagged
`dangerouslySetInnerHTML` — as written it renders `html` unsanitized, so only pass trusted content
or wrap it with DOMPurify"*. The feedback loop into the generating agent works.

## Layers 2 and 3 — LLM diff review on `Stop`, agentic review on `git commit`

Both skipped, direct invocation and real session alike:

```
Stop hook: LLM review disabled or no API credentials          → skip_reason 3
Commit review: LLM review disabled or no API credentials      → skip_reason 22
```

Cause, from `hooks/llm.py:102-125`: `HAS_API_CREDENTIALS = bool(ANTHROPIC_API_KEY or
ANTHROPIC_AUTH_TOKEN or <3P provider flag>)` — environment variables only. An OAuth login stores
its token in the macOS keychain (`Claude Code-credentials` entry present), which the hook never
reads. **For a subscription user with no API key exported, the two LLM layers are dead**, and
they fail silent — the session shows nothing.

Not measured: the catch rate of layers 2/3 on snippets 5–9. That needs `ANTHROPIC_API_KEY` in
the hook's environment; nobody on this project has one exported, and that is the point.

## Side finding — hops's own pre-commit hook caught the planted key

`git commit` in the worktree was refused before the plugin was even consulted:

```
▶ secrets: Scanning staged files for credentials...
  ✗ Potential secret in hop-backend/src/probe/UserRepo.kt:
+  val apiKey = "sk-ant-api03-AAAA…"
✗ Secrets detected in staged files. Remove them before committing.
```

`HEAD` stayed at `8039e6939`. The deterministic local layer already does the one thing the
regex layer cannot do for Kotlin. (The `[detached …]` line the commit-review hook parsed was
synthesised for the probe; the real commit never happened.)

## What this means for item 11

1. The generation-time control exists in hops **on paper**. Its instruction-file enable is a
   no-op until each developer installs the plugin, and its LLM layers are a no-op until each
   developer exports an API key. Neither prerequisite is written anywhere in hops.
2. Layer 1 is the only layer that runs for free, and it is blind to hop-backend's language.
3. The deterministic gates (`scripts/pre-commit`, gitleaks in CI, SonarQube MR gate) remain
   the layers that actually fire for Kotlin — consistent with the roadmap's own "deterministic
   SAST behind the agents" row.

## Not verified

- ~~Whether interactive mode prompts to install~~ — resolved from the docs (v2.1.195+,
  code.claude.com/docs/en/discover-plugins): a plugin that only the project's `settings.json`
  enables *does not load until the team member runs `claude plugin install`*. No auto-install,
  headless or interactive. The hooks reference lists no credential variable for hook subprocesses.
- Whether any other hops developer has the plugin installed or an API key exported — only this
  machine was inspected.
- SonarQube rule coverage for classes 5, 7, 8, 9 — rules live on the server.
- Layers 2/3 catch rate (needs an API key).
