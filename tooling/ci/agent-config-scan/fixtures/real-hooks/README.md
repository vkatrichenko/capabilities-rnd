# Negative-control fixture — the real hook surface

Verbatim copies of the hook wiring and hook scripts that ship in `hops` (`.claude/settings.json`
hooks + `extraKnownMarketplaces`, `scripts/claude-hooks/block-secrets.sh`, `scripts/pre-commit`),
taken 2026-08-25 at `origin/main` `dca2ed7b0`.

These files must produce **zero blocking findings**. They are here because three of the scanner's
rules were rewritten to keep it that way, and a future rule tightening would otherwise silently
start failing every hops PR:

- `credential-read` — `block-secrets.sh` has to name every credential path in order to block it.
- `guard-tamper` — `scripts/pre-commit` documents its own `SKIP_SECRETS=1` escape hatch, and a real
  hops hook legitimately reinstalls the guard with `cp scripts/pre-commit .git/hooks/pre-commit`.
- `hardcoded-credential` — `scripts/pre-commit` carries the *definition* of a secret pattern
  (`AKIA[0-9A-Z]`, `ghp_[a-zA-Z0-9]`, `xoxb-[0-9]`) as its detector list.

If a change to the scanner makes this fixture fail, the change is wrong until proven otherwise.
Refresh the copies only alongside a real change in `hops`, and re-record the result.
