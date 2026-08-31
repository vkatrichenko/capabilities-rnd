#!/usr/bin/env bash
# Hold check-mcp-pins.mjs (ships to Node repos) and check_mcp_pins.py (ships to Python repos) to
# byte-identical stdout and exit codes on real inputs, in both text and --json mode, with and
# without --require-surface. Same discipline as tooling/ci/scorecard/agreement-check.sh.
#
# Usage: ./agreement-check.sh <repo-dir> [<repo-dir> ...]
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail=0
for repo in "$@"; do
  label="$(basename "$repo")"
  for mode in "" "--json" "--require-surface" "--json --require-surface"; do
    # shellcheck disable=SC2086
    node "$here/check-mcp-pins.mjs" --repo "$repo" $mode >"$work/out.node" 2>&1; n=$?
    # shellcheck disable=SC2086
    python3 "$here/check_mcp_pins.py" --repo "$repo" $mode >"$work/out.py" 2>&1; p=$?
    if [ "$n" != "$p" ]; then echo "MISMATCH exit  $label [$mode]: node=$n python=$p"; fail=1; continue; fi
    if ! diff -q "$work/out.node" "$work/out.py" >/dev/null; then
      echo "MISMATCH output $label [$mode]:"; diff "$work/out.node" "$work/out.py" | head -20; fail=1; continue; fi
    echo "agree $label [${mode:-text}] (exit $n)"
  done
done
[ "$fail" = 0 ] && echo "ALL AGREE" || echo "DISAGREEMENT FOUND"
exit $fail
