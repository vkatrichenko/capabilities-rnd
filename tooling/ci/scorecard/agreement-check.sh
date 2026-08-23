#!/usr/bin/env bash
# Hold the two implementations to byte-identical behaviour on real inputs.
#
# check-scorecard.mjs ships to repos whose CI has Node; check_scorecard.py ships
# to repos whose CI has Python. Two implementations of one policy drift unless
# something forces them not to — this is that something. The same discipline the
# hallucinated-package check used when it was ported Python -> Node for hops.
#
# For every Scorecard result JSON given, it compares both implementations under
# three baselines: the result's own (clean), one with a gated check raised
# (regression), and one with a gated check removed (fail-closed). Exit codes and
# stdout must match exactly.
#
# Usage: ./agreement-check.sh <results.json> [<results.json> ...]

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

mutate() { # <baseline-in> <mode> <baseline-out>
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
src, mode, dst = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src, encoding="utf-8") as fh:
    b = json.load(fh)
if mode == "raise":
    for name in ("Binary-Artifacts", "Code-Review", "CI-Tests", "Dangerous-Workflow"):
        if b["checks"].get(name, 10) < 10:
            b["checks"][name] += 1
            break
    else:
        b["checks"]["Pinned-Dependencies"] = b["checks"].get("Pinned-Dependencies", 0) + 1
elif mode == "drop":
    b["checks"].pop("Token-Permissions", None)
with open(dst, "w", encoding="utf-8") as fh:
    json.dump(b, fh, indent=2)
PY
}

for results in "$@"; do
  label="$(basename "$results")"
  node "$here/check-scorecard.mjs" --results "$results" --write-baseline "$work/base.json" >/dev/null || {
    echo "SKIP $label (not a Scorecard result)"; continue; }
  mutate "$work/base.json" raise "$work/raised.json"
  mutate "$work/base.json" drop "$work/dropped.json"

  for case in base raised dropped; do
    node "$here/check-scorecard.mjs" --results "$results" --baseline "$work/$case.json" >"$work/out.node" 2>&1
    node_code=$?
    python3 "$here/check_scorecard.py" --results "$results" --baseline "$work/$case.json" >"$work/out.py" 2>&1
    py_code=$?
    if [ "$node_code" != "$py_code" ]; then
      echo "MISMATCH exit  $label/$case: node=$node_code python=$py_code"; fail=1; continue
    fi
    if ! diff -q "$work/out.node" "$work/out.py" >/dev/null; then
      echo "MISMATCH output $label/$case:"; diff "$work/out.node" "$work/out.py" | head -20; fail=1; continue
    fi
    echo "agree $label/$case (exit $node_code)"
  done
done

[ "$fail" = 0 ] && echo "ALL AGREE" || echo "DISAGREEMENT FOUND"
exit $fail
