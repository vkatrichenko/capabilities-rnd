#!/usr/bin/env python3
"""Flag newly added npm dependencies that look hallucinated or squatted.

Checks only dependencies ADDED by a change — existing ones are the base branch's
problem, not this PR's. See research/findings/hallucinated-package-check-design.md
for why each rule exists and what it measurably costs in false positives.

Usage:
    check_new_deps.py --base-ref origin/main --manifest hop-ui/package.json
    check_new_deps.py --before old/package.json --after new/package.json

Exit codes: 0 clean or advisory-only, 1 findings that block, 2 usage/IO error.
"""

from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

REGISTRY = "https://registry.npmjs.org"
UA = "slopsquat-check (Provectus DevOps Capabilities Research)"

# Thresholds. Every one of these was measured against a real 111-dependency
# manifest before being chosen; see the design note for the numbers.
MIN_AGE_DAYS = 90          # a name added to our manifest younger than this needs a human
YOUNG_SINGLE_VERSION = 365 # one published version this recently is the shape of a fresh squat
NEIGHBOUR_MAX_DISTANCE = 2 # edit distance to an existing dependency
NEIGHBOUR_MIN_LENGTH = 8   # below this, distance 2 is most of the name — pure noise
RETRIES = 3                # registry lookups are retried before giving up

# Specifiers that never resolve to the public registry. A `link:` local plugin is
# not a hallucination, and treating it as one is the first false positive this
# check would have produced on hops.
LOCAL_PREFIXES = ("link:", "file:", "workspace:", "portal:", "catalog:", "npm:")
URL_PREFIXES = ("git+", "git:", "http:", "https:", "github:", "gitlab:", "bitbucket:")

DEP_FIELDS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")


class Unreachable(Exception):
    """The registry could not be reached — distinct from "package not found"."""


class Finding:
    def __init__(self, package: str, rule: str, severity: str, detail: str):
        self.package, self.rule, self.severity, self.detail = package, rule, severity, detail

    @property
    def blocking(self) -> bool:
        return self.severity == "block"

    def __str__(self) -> str:
        mark = {"block": "BLOCK", "review": "REVIEW", "info": "info "}[self.severity]
        return f"  [{mark}] {self.package}\n          {self.rule}: {self.detail}"


def is_registry_specifier(spec: str) -> bool:
    """True when the specifier resolves against the public npm registry."""
    s = spec.strip()
    if s.startswith(LOCAL_PREFIXES) or s.startswith(URL_PREFIXES):
        return False
    # `owner/repo` is GitHub shorthand; a semver range never contains a slash.
    return "/" not in s


def deps_of(manifest: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for field in DEP_FIELDS:
        out.update(manifest.get(field) or {})
    return out


def levenshtein(a: str, b: str, cutoff: int = 2) -> int:
    if abs(len(a) - len(b)) > cutoff:
        return cutoff + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


class NpmRegistry:
    """Real registry client. Tests inject a stub with the same two methods."""

    def __init__(self, timeout: int = 20):
        self.timeout = timeout

    def metadata(self, name: str) -> dict | None:
        """Package document, None when the name does not exist.

        Raises Unreachable when the registry cannot answer. A 404 is an answer;
        a timeout is not, and the two must not be conflated — treating an outage
        as "package does not exist" would block every PR that adds a dependency.
        """
        url = f"{REGISTRY}/{urllib.parse.quote(name, safe='@')}"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        last: Exception | None = None
        for _ in range(RETRIES):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    return None
                last = exc
            except Exception as exc:  # timeout, DNS, TLS, malformed body
                last = exc
        raise Unreachable(f"{type(last).__name__}: {last}")


def evaluate(name: str, meta: dict | None, existing: set[str], now: dt.datetime) -> list[Finding]:
    if meta is None:
        return [Finding(name, "does-not-exist", "block",
                        "no such package on the npm registry — a hallucinated or mistyped name, "
                        "or a package that was unpublished")]

    findings: list[Finding] = []
    created_raw = (meta.get("time") or {}).get("created")
    age_days = None
    if created_raw:
        created = dt.datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        age_days = (now - created).days

    versions = len(meta.get("versions") or {})

    if age_days is not None and age_days < MIN_AGE_DAYS:
        findings.append(Finding(
            name, "recently-registered", "review",
            f"first published {age_days} days ago (threshold {MIN_AGE_DAYS}). Attackers register "
            f"hallucinated names and wait; a name this new entering our manifest needs a human to "
            f"confirm it is the package they meant"))
    elif age_days is not None and versions <= 1 and age_days < YOUNG_SINGLE_VERSION:
        findings.append(Finding(
            name, "single-version", "review",
            f"one published version, first published {age_days} days ago — the shape of a name "
            f"registered to be found rather than a maintained package"))

    if not meta.get("repository"):
        findings.append(Finding(
            name, "no-repository", "info",
            "no repository field, so the source cannot be reviewed from the registry alone"))

    for other in sorted(existing):
        if other == name or min(len(other), len(name)) < NEIGHBOUR_MIN_LENGTH:
            continue
        distance = levenshtein(name, other, NEIGHBOUR_MAX_DISTANCE)
        if distance <= NEIGHBOUR_MAX_DISTANCE:
            findings.append(Finding(
                name, "near-neighbour", "review",
                f"edit distance {distance} from '{other}', which this project already depends on — "
                f"confirm this is a second package and not a typo of the first"))
            break

    return findings


def load_allowlist(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    try:
        with open(path) as fh:
            entries = json.load(fh)
    except FileNotFoundError:
        return {}
    return {e["package"]: e.get("reason", "(no reason recorded)") for e in entries.get("allow", [])}


def git_show(ref: str, path: str) -> dict:
    try:
        blob = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True,
                              text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return {}  # manifest did not exist on the base ref: every dependency is new
    return json.loads(blob)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-ref", help="git ref to diff against (e.g. origin/main)")
    ap.add_argument("--manifest", help="path to package.json, used with --base-ref")
    ap.add_argument("--before", help="path to the previous package.json")
    ap.add_argument("--after", help="path to the new package.json")
    ap.add_argument("--allowlist", help="JSON file of accepted packages")
    ap.add_argument("--advisory", action="store_true",
                    help="report findings but always exit 0")
    args = ap.parse_args(argv)

    if args.base_ref and args.manifest:
        with open(args.manifest) as fh:
            after = json.load(fh)
        before = git_show(args.base_ref, args.manifest)
        label = args.manifest
    elif args.before and args.after:
        with open(args.before) as fh:
            before = json.load(fh)
        with open(args.after) as fh:
            after = json.load(fh)
        label = args.after
    else:
        ap.error("give either --base-ref with --manifest, or --before with --after")
        return 2

    old, new = deps_of(before), deps_of(after)
    added = {n: s for n, s in new.items() if n not in old}
    allowed = load_allowlist(args.allowlist)

    checkable = {n: s for n, s in added.items() if is_registry_specifier(s)}
    skipped = sorted(set(added) - set(checkable))

    print(f"slopsquat-check: {label}")
    print(f"  dependencies added by this change: {len(added)}")
    if skipped:
        print(f"  not registry-resolved, skipped: {', '.join(skipped)}")
    if not checkable:
        print("  nothing to check.")
        return 0

    registry = NpmRegistry()
    now = dt.datetime.now(dt.timezone.utc)
    existing = set(old)
    findings: list[Finding] = []
    unreachable: list[tuple[str, str]] = []
    for name in sorted(checkable):
        if name in allowed:
            print(f"  allowlisted: {name} — {allowed[name]}")
            continue
        try:
            meta = registry.metadata(name)
        except Unreachable as exc:
            unreachable.append((name, str(exc)))
            continue
        findings.extend(evaluate(name, meta, existing, now))

    if unreachable:
        # Fail open, loudly. An unreachable registry says nothing about the
        # package, and a check that breaks the build during an npm outage is a
        # check that gets deleted. The gap is printed so it is not invisible.
        print()
        print("  NOT CHECKED — the npm registry could not be reached:")
        for name, why in unreachable:
            print(f"    {name}  ({why})")
        print("  These packages were not verified. Re-run the job once the registry responds.")

    if not findings:
        print(f"  checked {len(checkable) - len(unreachable)}: all clear.")
        return 0

    print()
    for finding in findings:
        print(finding)
    blocking = [f for f in findings if f.blocking or f.severity == "review"]
    print()
    if not blocking:
        print("  advisory findings only.")
        return 0
    print(f"  {len(blocking)} finding(s) need a decision. If the package is legitimate, add it to "
          f"the allowlist with a reason and who confirmed it.")
    return 0 if args.advisory else 1


if __name__ == "__main__":
    sys.exit(main())
