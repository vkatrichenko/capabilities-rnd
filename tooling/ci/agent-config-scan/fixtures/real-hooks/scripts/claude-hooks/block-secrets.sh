#!/bin/bash
# PreToolUse hook: deny tool access to secret, key, and credential files.
# Exit code 2 tells Claude Code to block the tool call and surface stderr to the agent.
#
# In-scope tools: Read, Glob, Grep, Bash, Edit, Write, MultiEdit, NotebookEdit.
#
# Fails closed: any parse error or empty TARGET inside an in-scope tool exits 2.
# Allowlist: .env.example / .env.sample / .env.template / .env.dist pass through.
#
# Matching is case-insensitive — macOS APFS is case-insensitive by default
# and `Read({file_path: ".ENV"})` would otherwise resolve to the real `.env`.
#
# For Read/Edit/Write/MultiEdit/NotebookEdit, the path is also resolved via
# `readlink -f` so that a symlink like `notes.txt -> .env` is caught.
#
# Known limitations (defense-in-depth required — this hook is one layer only):
#   - Bash shell fragmentation bypasses the regex:
#       f=$(printf '\x2eenv'); cat "$f"
#       cat $(printf '.en''v')
#       eval / base64-decoded paths
#     The regex sees the literal source, not the runtime-assembled string.
#   - Pair with: pre-commit secret-scan, git-secrets, server-side scanners.

set -u

INPUT=$(cat)

# Single jq invocation: [tool_name, target] tab-separated.
# Target field varies by tool:
#   Read/Edit/Write/MultiEdit              → file_path
#   NotebookEdit                           → notebook_path
#   Glob/Grep                              → path (fallback to pattern)
#   Bash                                   → command
PARSED=$(printf '%s' "$INPUT" \
  | jq -r '[
      .tool_name // "",
      .tool_input.file_path
        // .tool_input.notebook_path
        // .tool_input.path
        // .tool_input.pattern
        // .tool_input.command
        // ""
    ] | @tsv')
JQ_STATUS=$?

if [ "$JQ_STATUS" -ne 0 ] || [ -z "$PARSED" ]; then
  printf 'Blocked by PreToolUse secret-guard hook: failed to parse tool input (jq exit=%s).\n' "$JQ_STATUS" >&2
  exit 2
fi

IFS=$'\t' read -r TOOL TARGET <<< "$PARSED"

case "$TOOL" in
  Read|Glob|Grep|Bash|Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

# In-scope tool with no target → almost certainly a payload-shape change. Fail closed.
if [ -z "${TARGET:-}" ]; then
  printf 'Blocked by PreToolUse secret-guard hook: %s call had no resolvable target field.\n' "$TOOL" >&2
  exit 2
fi

# Symlink resolution must happen BEFORE the prefix gate — otherwise a
# misleadingly-named symlink (e.g. `notes.txt -> .env`) would skip the gate
# and bypass the check. Skip for Glob/Grep (patterns) and Bash (commands).
case "$TOOL" in
  Read|Edit|Write|MultiEdit|NotebookEdit)
    RESOLVED=$(readlink -f "$TARGET" 2>/dev/null || true)
    if [ -n "$RESOLVED" ] && [ "$RESOLVED" != "$TARGET" ]; then
      TARGET="$TARGET $RESOLVED"
    fi
    ;;
esac

# Cheap prefix gate using `[[ ]]` + nocasematch — both bash builtins, no
# subshell. The vast majority of tool calls exit here without forking `tr`
# or `grep`.
shopt -s nocasematch
if ! [[ \
  "$TARGET" == *.env* || "$TARGET" == *.pem* || "$TARGET" == *.key* || \
  "$TARGET" == *.jks* || "$TARGET" == *.p12* || "$TARGET" == *.pfx* || \
  "$TARGET" == *.cer* || "$TARGET" == *.crt* || "$TARGET" == *.p7b* || \
  "$TARGET" == *.p8* || "$TARGET" == *.asc* || "$TARGET" == *.gpg* || \
  "$TARGET" == *credentials* || "$TARGET" == *secrets* || \
  "$TARGET" == *service-account* || "$TARGET" == *.aws/* || \
  "$TARGET" == *id_rsa* || "$TARGET" == *id_dsa* || \
  "$TARGET" == *id_ecdsa* || "$TARGET" == *id_ed25519* || \
  "$TARGET" == *.npmrc* || "$TARGET" == *.netrc* ]]; then
  shopt -u nocasematch
  exit 0
fi
shopt -u nocasematch

# Past the gate. Lowercase for the regex pass (macOS APFS is case-insensitive).
TARGET_LC=$(printf '%s' "$TARGET" | tr 'A-Z' 'a-z')

# Strip explicitly-safe templates so they do not trip the broader .env match.
CLEANED=${TARGET_LC//.env.example/}
CLEANED=${CLEANED//.env.sample/}
CLEANED=${CLEANED//.env.template/}
CLEANED=${CLEANED//.env.dist/}

# Lead class includes glob meta (`*`, `?`) so `cat *.env` and `Glob("**/*.env")` match.
SENSITIVE='(^|[/[:space:]"'\''=*?])\.env(\.[a-zA-Z0-9._-]+)?([^a-zA-Z0-9._/-]|$)'
# Named env files like `prod.env`, `dev.env`, `/etc/staging.env`.
SENSITIVE+='|(^|[/[:space:]"'\''=*?])[a-zA-Z0-9_-]+\.env([[:space:]"'\''/=]|$)'
SENSITIVE+='|\.(pem|key|jks|p12|pfx|cer|crt|p7b|p8|asc|gpg)([[:space:]"'\''/=]|$)'
SENSITIVE+='|credentials[^[:space:]"'\'']*\.(json|ya?ml|txt|env)'
SENSITIVE+='|secrets[^[:space:]"'\'']*\.(json|ya?ml|txt|env)'
SENSITIVE+='|service-account[^[:space:]"'\'']*\.json'
# Extension-less canonical credential paths (e.g. ~/.aws/credentials, ~/.aws/config).
SENSITIVE+='|(^|[/[:space:]"'\''=*?])\.aws/(credentials|config)([[:space:]"'\''/=]|$)'
SENSITIVE+='|(^|[/[:space:]"'\''=*?])(credentials|secrets)([[:space:]"'\''/=]|$)'
SENSITIVE+='|(^|[/[:space:]"'\''=*?])id_(rsa|dsa|ecdsa|ed25519)([._-][a-zA-Z0-9]+)?([[:space:]"'\''/=]|$)'
SENSITIVE+='|(^|[/[:space:]"'\''=*?])\.(npmrc|netrc)([[:space:]"'\''/=]|$)'

if printf '%s' "$CLEANED" | grep -qE "$SENSITIVE"; then
  printf 'Blocked by PreToolUse secret-guard hook: %s access to a secret/key/credential path: %s\n' "$TOOL" "$TARGET" >&2
  exit 2
fi

exit 0
