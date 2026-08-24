#!/usr/bin/env python3
"""Compare an OpenSSF Scorecard JSON result against a committed baseline and
fail when a gated check drops.

Python twin of check-scorecard.mjs, for repositories whose CI has no Node.
Both implementations produce byte-identical markdown for the same inputs; an
agreement check in the research repo holds them to that against real results.

Why a comparison instead of a threshold: Scorecard's aggregate is not a usable
gate for a private product repo. Four checks (License, Security-Policy,
CII-Best-Practices, Fuzzing) score against open-source norms; SAST is a known
false negative wherever the SAST tool is self-hosted; Signed-Releases reports
-1 when no releases exist. A per-check ratchet says the only thing worth
saying: this repo did not get worse than the state we agreed to.

Fails closed. A gated check that is missing from the results, has gone
inconclusive (-1), or is absent from the baseline is a failure, not a pass.

Standard library only, Python >= 3.9. Usage:
  python3 check_scorecard.py --results results.json --baseline baseline.json
  python3 check_scorecard.py --results results.json --write-baseline baseline.json
  python3 check_scorecard.py --results results.json --baseline baseline.json \
      --summary "$GITHUB_STEP_SUMMARY"

Exit 0 no regression, 1 a gated check regressed, 2 usage or unreadable input.
"""

import argparse
import json
import sys

# Gated: a drop fails the job. Each of these moves only when someone changes
# this repository — a workflow, a dependency pin, a review setting — so a drop
# is always actionable by whoever caused it.
GATED = [
    "Pinned-Dependencies",
    "Token-Permissions",
    "Dangerous-Workflow",
    "Binary-Artifacts",
    "Code-Review",
    "CI-Tests",
]

# Reported but never gated: these move with the outside world (a new advisory
# published against a dependency we already had) or with repository settings
# that no PR author can change. Gating them produces failures nobody can fix,
# which is how a gate gets deleted.
REPORTED = [
    "Vulnerabilities",
    "Branch-Protection",
    "Maintained",
    "Dependency-Update-Tool",
    "Contributors",
    "Packaging",
]

# Not tracked at all, with the reason recorded so nobody "fixes" them later.
IGNORED = {
    "SAST": (
        "false negative — Scorecard detects CodeQL and SonarCloud; a self-hosted "
        "SonarQube instance is invisible to it"
    ),
    "License": "open-source norm, not applicable to a private product repo",
    "Security-Policy": "open-source norm, not applicable to a private product repo",
    "CII-Best-Practices": "open-source norm, not applicable to a private product repo",
    "Fuzzing": "open-source norm, not applicable to a private product repo",
    "Signed-Releases": "inconclusive (-1) while no releases exist",
}

TRACKED = GATED + REPORTED


class InputError(Exception):
    pass


def read_json(path):
    try:
        with open(path, encoding="utf-8") as handle:
            raw = handle.read()
    except OSError as exc:
        raise InputError(f"cannot read {path}: {exc.strerror or exc}") from exc
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise InputError(f"cannot parse {path}: {exc}") from exc


def scores_of(results):
    """Checks by name, from a Scorecard JSON result."""
    if not isinstance(results, dict) or not isinstance(results.get("checks"), list):
        raise InputError("not a Scorecard JSON result: no `checks` array")
    return {c["name"]: c for c in results["checks"]}


def baseline_from(results):
    """The trimmed baseline we commit: tracked scores plus what produced them."""
    checks = scores_of(results)
    tracked = {name: checks[name]["score"] for name in TRACKED if name in checks}
    repo = results.get("repo") or {}
    scorecard = results.get("scorecard") or {}
    return {
        "_comment": (
            "Ratchet for check_scorecard.py. Raising a score here is a reviewed "
            "commit, never automatic."
        ),
        "scorecard_version": scorecard.get("version", "unknown"),
        "measured": {
            "date": results.get("date", "unknown"),
            "repo": repo.get("name", "unknown"),
            "commit": repo.get("commit", "unknown"),
            "aggregate": results.get("score"),
        },
        "checks": tracked,
    }


def compare(results, baseline):
    """Returns (rows, regressions, notes). A non-empty `regressions` means exit 1."""
    checks = scores_of(results)
    base = baseline.get("checks") if isinstance(baseline, dict) else None
    if not isinstance(base, dict):
        raise InputError("not a baseline file: no `checks` object")

    rows, regressions, notes = [], [], []

    base_version = baseline.get("scorecard_version", "unknown")
    now_version = (results.get("scorecard") or {}).get("version", "unknown")
    if base_version != now_version:
        # Not a failure, but it must be said out loud: check definitions change
        # between Scorecard versions, so a delta across versions is not
        # evidence that the repository moved.
        notes.append(
            f"Scorecard version changed since the baseline ({base_version} -> {now_version}). "
            "A score difference across versions may be tool drift, not a repository change. "
            "Re-baseline deliberately rather than reading it as a win or a regression."
        )

    for name in TRACKED:
        gated = name in GATED
        check = checks.get(name)
        before = base.get(name)
        after = check["score"] if check else None
        row = {
            "name": name,
            "gated": gated,
            "ignored": False,
            "before": before,
            "after": after,
            "reason": check.get("reason", "") if check else "",
            "status": "ok",
        }

        if after is None:
            row["status"] = "missing from results"
            if gated:
                regressions.append(row)
        elif before is None:
            row["status"] = "missing from baseline"
            if gated:
                regressions.append(row)
        elif after == -1 and before != -1:
            row["status"] = "inconclusive (-1)"
            if gated:
                regressions.append(row)
        elif after < before:
            row["status"] = "REGRESSED"
            if gated:
                regressions.append(row)
        elif after > before:
            row["status"] = "improved"
        rows.append(row)

    for name, why in IGNORED.items():
        if name not in checks:
            continue
        rows.append(
            {
                "name": name,
                "gated": False,
                "ignored": True,
                "before": None,
                "after": checks[name]["score"],
                "reason": why,
                "status": "not tracked",
            }
        )

    return rows, regressions, notes


def to_markdown(results, baseline, verdict):
    rows, regressions, notes = verdict
    repo = results.get("repo") or {}
    measured = baseline.get("measured") or {}
    repo_name = repo.get("name", "?")
    repo_commit = (repo.get("commit") or "")[:9]
    version = (results.get("scorecard") or {}).get("version", "?")
    base_commit = (measured.get("commit") or "")[:9]
    base_date = measured.get("date", "?")
    aggregate = results.get("score")

    def num(value):
        return "—" if value is None else str(value)

    out = []
    out.append("## OpenSSF Scorecard")
    out.append("")
    out.append(
        f"`{repo_name}` @ `{repo_commit}` · Scorecard {version} · "
        f"baseline `{base_commit}` ({base_date})"
    )
    out.append("")
    out.append(
        f"Aggregate **{aggregate}** — reported only. It is not a gate: four checks score a "
        "private repo against open-source norms, and SAST is a known false negative here."
    )
    out.append("")
    out.append("| Check | Policy | Baseline | Now | Status |")
    out.append("|---|---|---:|---:|---|")
    for row in rows:
        policy = "ignored" if row["ignored"] else ("**gated**" if row["gated"] else "reported")
        status = "**REGRESSED**" if row["status"] == "REGRESSED" else row["status"]
        before, after = num(row["before"]), num(row["after"])
        out.append(f"| {row['name']} | {policy} | {before} | {after} | {status} |")
    out.append("")
    for note in notes:
        out.append(f"> {note}")
    if notes:
        out.append("")
    if regressions:
        out.append("### Gated regressions")
        out.append("")
        for row in regressions:
            before, after = num(row["before"]), num(row["after"])
            out.append(f"- **{row['name']}**: {before} -> {after} ({row['status']})")
            if row["reason"]:
                out.append(f"  - {row['reason']}")
    else:
        out.append("No gated check regressed.")
    out.append("")
    return "\n".join(out)


def _stderr(message):
    print(message, file=sys.stderr)


def main(argv, log=print, err=_stderr):
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--results")
    parser.add_argument("--baseline")
    parser.add_argument("--write-baseline", dest="write_baseline")
    parser.add_argument("--summary")
    parser.add_argument("--advisory", action="store_true")
    try:
        args, _unknown = parser.parse_known_args(argv)
    except SystemExit:
        return 2

    usage = (
        "usage: --results <scorecard.json> (--baseline <baseline.json> | "
        "--write-baseline <path>) [--summary <path>] [--advisory]"
    )
    if not args.results:
        err(usage)
        return 2

    try:
        results = read_json(args.results)
        if args.write_baseline:
            with open(args.write_baseline, "w", encoding="utf-8") as handle:
                written = json.dumps(baseline_from(results), indent=2, ensure_ascii=False)
                handle.write(written + "\n")
            log(f"wrote baseline: {args.write_baseline}")
            return 0
        if not args.baseline:
            err(usage)
            return 2
        baseline = read_json(args.baseline)
        verdict = compare(results, baseline)
        markdown = to_markdown(results, baseline, verdict)
        log(markdown)
        if args.summary:
            with open(args.summary, "w", encoding="utf-8") as handle:
                handle.write(markdown)
        if not verdict[1]:
            return 0
        return 0 if args.advisory else 1
    except InputError as exc:
        err(f"check-scorecard: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
