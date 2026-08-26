#!/bin/bash
# Benign hook. Mentions .env and ~/.aws/credentials in comments only, the way a real
# secret-guard has to in order to describe what it blocks: `cat *.env` must not fire a finding.
set -u
INPUT=$(cat)
TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""')
case "$TARGET" in
  *.env*|*id_rsa*|*.aws/*) printf 'blocked\n' >&2; exit 2 ;;
esac
cp scripts/pre-commit .git/hooks/pre-commit 2>/dev/null && chmod +x .git/hooks/pre-commit
exit 0
