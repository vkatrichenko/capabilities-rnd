#!/usr/bin/env python3
"""Check that every stdio MCP server in a repo's MCP config launches a pinned third party.

Python twin of check-mcp-pins.mjs, for repos whose CI is Python. Same policy, same output,
same exit codes — held byte-identical by tooling/ci/mcp-pin-check/agreement-check.sh in the
research repo. Read the header of the Node file for the reasoning; the short version:

  fail  git URL with no ref, pre-release channel (@canary, @next, ...), `npx -y`
  warn  :latest / @latest / no tag from a publisher's stable channel — reported, never blocks
  pass  a tag, an exact version, or a digest. A minor tag is enough; a digest is NOT required.
  skip  http/sse servers and local launchers (poetry run, node ./x, python -m)

Usage:
  check_mcp_pins.py [--repo <path>] [--allowlist <file>] [--require-surface] [--advisory] [--json]

Exit codes: 0 clean or warn-only, 1 fail findings, 2 usage/IO error.
"""

from __future__ import annotations

import json
import os
import re
import sys

CONFIG_FILES = [".mcp.json", ".claude/.mcp.json", ".cursor/mcp.json", ".vscode/mcp.json"]

PRERELEASE = re.compile(
    r"^(?:canary|next|beta|alpha|rc|dev|nightly|insiders|main|master|head)$", re.I
)
EXACT_VERSION = re.compile(r"^v?\d+(?:\.\d+)*(?:[-+][\w.]+)?$")
DIGEST = re.compile(r"@sha256:[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{7,40}$", re.I)
GIT_SPEC = re.compile(r"^(?:git\+)?((?:https?|ssh|git)://[^@#\s]+|github:[^@#\s]+)(?:[@#](.+))?$")
PEP_SPEC = re.compile(r"^([^=@]+)==(.+)$")

NODE_RUNNERS = {"npx", "bunx", "pnpx"}
PY_RUNNERS = {"uvx", "pipx"}
DOCKER_VALUE_FLAGS = {
    "-e",
    "--env",
    "--env-file",
    "-v",
    "--volume",
    "--mount",
    "-p",
    "--publish",
    "--name",
    "-w",
    "--workdir",
    "--network",
    "--net",
    "--entrypoint",
    "--platform",
    "-u",
    "--user",
    "--label",
    "-l",
    "--add-host",
    "--cap-add",
    "--cap-drop",
    "--tmpfs",
    "--security-opt",
    "--memory",
    "-m",
    "--cpus",
    "--restart",
    "--log-driver",
    "--log-opt",
    "--pull",
    "--dns",
    "--hostname",
    "-h",
    "--device",
    "--gpus",
    "--shm-size",
    "--ulimit",
    "--group-add",
}

WHY = {
    "refless-git": "runs a third party's default branch — nobody chose the version that executes",
    "prerelease-channel": "a pre-release channel changes and breaks underneath you by design",
    "auto-yes": "auto-accepts installing whatever the registry resolves at launch",
    "mutable-latest": "mutable, but the publisher's stable channel — pin a tag or record the acceptance",
    "unpinned": "no version at all — resolves to latest on every launch",
    "version-range": "a range floats inside its bounds",
    "unparsed": "the launch could not be parsed — check it by hand",
    "missing-surface": "no MCP config to check — a gate must not pass by having nothing to check",
}


class Finding:
    def __init__(self, rule, severity, label, why, detail):
        self.rule, self.severity, self.label, self.why, self.detail = (
            rule,
            severity,
            label,
            why,
            detail,
        )

    @property
    def blocking(self):
        return self.severity == "fail"

    def to_dict(self):
        return {
            "rule": self.rule,
            "severity": self.severity,
            "label": self.label,
            "why": self.why,
            "detail": self.detail,
        }

    def __str__(self):
        mark = "x" if self.severity == "fail" else "-"
        return f"  {mark} {self.rule}  {self.label}\n      {self.why} — {self.detail}"


# ---------------------------------------------------------------------------
# Version classification — verdict dicts keep key order (severity, rule, detail) to match Node
# ---------------------------------------------------------------------------


def _v(severity, detail, rule=None):
    return (
        {"severity": severity, "rule": rule, "detail": detail}
        if rule
        else {"severity": severity, "detail": detail}
    )


def classify_version(spec, refless):
    if refless:
        return _v("fail", f"{spec} — git URL with no tag or commit", "refless-git")
    if spec is None:
        return _v("warn", "no version at all — resolves to latest", "unpinned")
    if spec.lower() == "latest":
        return _v("warn", f"@{spec}", "mutable-latest")
    if PRERELEASE.match(spec):
        return _v("fail", f"@{spec}", "prerelease-channel")
    if EXACT_VERSION.match(spec) or COMMIT.match(spec):
        return _v("pass", f"@{spec}")
    return _v(
        "warn", f"@{spec} — a range, resolves to whatever is newest inside it", "version-range"
    )


def split_spec(token):
    m = PEP_SPEC.match(token)
    if m:
        return m.group(1), m.group(2)
    at = token.rfind("@")
    if at > 0:
        return token[:at], token[at + 1 :]
    return token, None


def split_git(token):
    m = GIT_SPEC.match(token)
    if not m:
        return None
    return m.group(1), m.group(2) or None


def _with_detail(v, detail):
    out = dict(v)
    out["detail"] = detail
    return out


def classify_docker(args):
    if "run" not in args:
        return _v("skip", f"docker {args[0] if args else ''} — not a run")
    i = args.index("run") + 1
    image = None
    while i < len(args):
        a = args[i]
        if a in DOCKER_VALUE_FLAGS:
            i += 2
            continue
        if a.startswith("-"):
            i += 1
            continue
        image = a
        break
    if image is None:
        return _v("warn", "docker run with no image token found", "unparsed")
    if DIGEST.search(image):
        return _v("pass", image[: image.index("@") + 20] + "…")
    slash, colon = image.rfind("/"), image.rfind(":")
    tag = image[colon + 1 :] if colon > slash else None
    name = image[:colon] if colon > slash else image
    v = classify_version(tag, False)
    suffix = " — no tag, resolves to latest" if v.get("rule") == "unpinned" else ""
    return _with_detail(v, f"{name}{':' + tag if tag else ''}{suffix}")


def _classify_spec(runner, pkg, git_sep):
    git = split_git(pkg)
    if git:
        url, ref = git
        v = classify_version(ref, not ref)
        suffix = " — " + v["detail"] if v.get("rule") and ref else ""
        return _with_detail(v, f"{url}{git_sep + ref if ref else ''}{suffix}")
    name, version = split_spec(pkg)
    v = classify_version(version, False)
    suffix = " — " + v["detail"] if v.get("rule") and not version else ""
    return _with_detail(v, f"{name}{'@' + version if version else ''}{suffix}")


def classify_node(runner, args):
    auto_yes = any(a in ("-y", "--yes") for a in args)
    pkg = next((a for a in args if not a.startswith("-")), None)
    if auto_yes:
        return _v(
            "fail",
            f"{runner} -y {pkg or ''} — installs whatever resolves without a prompt",
            "auto-yes",
        )
    if pkg is None:
        return _v("warn", f"{runner} with no package token", "unparsed")
    return _classify_spec(runner, pkg, "#")


def classify_python(runner, args):
    spec = (
        args[args.index("--from") + 1]
        if "--from" in args and args.index("--from") + 1 < len(args)
        else None
    )
    if spec is None and "--from" not in args:
        spec = next((a for a in args if not a.startswith("-")), None)
    if spec is None:
        return _v("warn", f"{runner} with no package token", "unparsed")
    return _classify_spec(runner, spec, "@")


def classify_server(server):
    server = server if isinstance(server, dict) else {}
    stype = server.get("type") or (
        "stdio" if server.get("command") else "http" if server.get("url") else "unknown"
    )
    if stype != "stdio":
        return _v("skip", f"{stype} — remote, nothing to pin")
    command = str(server.get("command") or "")
    args = [str(a) for a in server.get("args", [])] if isinstance(server.get("args"), list) else []
    binary = command.split("/")[-1]

    if binary in ("docker", "podman"):
        return classify_docker(args)
    if binary in NODE_RUNNERS:
        return classify_node(binary, args)
    if binary in PY_RUNNERS:
        return classify_python(binary, args)
    if binary in ("pnpm", "yarn") and args[:1] == ["dlx"]:
        return classify_node(f"{binary} dlx", args[1:])
    if binary == "uv" and args[:2] == ["tool", "run"]:
        return classify_python("uv tool run", args[2:])
    return _v("skip", f"{binary} {' '.join(args[:3])} — local launcher")


# ---------------------------------------------------------------------------
# Repo scan
# ---------------------------------------------------------------------------


def read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as err:
        raise RuntimeError(f"{path}: {err}") from err


def scan_repo(repo_root):
    repo_root = os.path.abspath(repo_root)
    findings, servers, config_files = [], [], 0
    for rel in CONFIG_FILES:
        abs_path = os.path.join(repo_root, rel)
        if not os.path.exists(abs_path):
            continue
        cfg = read_json(abs_path)
        if cfg is None:
            continue
        config_files += 1
        label = os.path.relpath(abs_path, repo_root)
        entries = cfg.get("mcpServers") or cfg.get("servers") or {}
        for name, server in entries.items():
            verdict = classify_server(server)
            servers.append({"file": label, "name": name, **verdict})
            if verdict["severity"] in ("fail", "warn"):
                findings.append(
                    Finding(
                        verdict["rule"],
                        verdict["severity"],
                        f"{label}:mcpServers.{name}",
                        WHY[verdict["rule"]],
                        verdict["detail"],
                    )
                )
    return {
        "findings": findings,
        "servers": servers,
        "summary": {"configFiles": config_files, "servers": len(servers)},
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args(argv):
    args = {
        "repo": os.getcwd(),
        "allowlist": None,
        "advisory": False,
        "json": False,
        "requireSurface": False,
        "help": False,
    }
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--repo":
            i += 1
            args["repo"] = argv[i] if i < len(argv) else None
        elif a == "--allowlist":
            i += 1
            args["allowlist"] = argv[i] if i < len(argv) else None
        elif a == "--require-surface":
            args["requireSurface"] = True
        elif a == "--advisory":
            args["advisory"] = True
        elif a == "--json":
            args["json"] = True
        elif a in ("--help", "-h"):
            args["help"] = True
        else:
            raise RuntimeError(f"unknown argument: {a}")
        i += 1
    if not args["repo"]:
        raise RuntimeError("--repo needs a path")
    return args


def main(argv, out=None):
    out = out or sys.stdout
    try:
        args = parse_args(argv)
    except RuntimeError as err:
        print(f"mcp-pin-check: {err}", file=sys.stderr)
        return 2
    if args["help"]:
        print(
            "usage: check-mcp-pins.mjs [--repo <path>] [--allowlist <file>] [--require-surface] [--advisory] [--json]",
            file=out,
        )
        return 0

    try:
        allowed = read_json(args["allowlist"]) if args["allowlist"] else {}
        if allowed is None:
            raise RuntimeError(f"allowlist not found: {args['allowlist']}")
        result = scan_repo(args["repo"])
    except RuntimeError as err:
        print(f"mcp-pin-check: {err}", file=sys.stderr)
        return 2

    if args["requireSurface"] and result["summary"]["configFiles"] == 0:
        result["findings"].append(
            Finding(
                "missing-surface",
                "fail",
                CONFIG_FILES[0],
                WHY["missing-surface"],
                "--require-surface is set; a deleted or renamed .mcp.json would otherwise report clean",
            )
        )

    kept, suppressed = [], []
    for f in result["findings"]:
        key = f"{f.rule}@{f.label}"
        if allowed.get(key):
            suppressed.append({"finding": f.to_dict(), "reason": allowed[key], "key": key})
        else:
            kept.append(f)

    if args["json"]:
        payload = {
            "summary": result["summary"],
            "servers": result["servers"],
            "findings": [f.to_dict() for f in kept],
            "suppressed": suppressed,
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False), file=out)
    else:
        print(f"mcp-pin-check: {args['repo']}", file=out)
        if result["summary"]["configFiles"] == 0:
            print("  no MCP config file — no MCP surface in this repo.", file=out)
        else:
            for s in result["servers"]:
                print(
                    f"  {s['severity'].ljust(4)}  {s['file']}:{s['name']}  {s['detail']}", file=out
                )
        for s in suppressed:
            print(f"  allowlisted: {s['key']} — {s['reason']}", file=out)
        if kept:
            print("", file=out)
            for f in kept:
                print(str(f), file=out)
        else:
            print("  all clear.", file=out)

    blocking = [f for f in kept if f.blocking]
    if not blocking:
        if kept and not args["json"]:
            print(
                "\n  warnings only — pin a tag, or record the acceptance in docs/processes/security-notes.md.",
                file=out,
            )
        return 0
    if not args["json"]:
        print(
            f"\n  {len(blocking)} failing server(s). Pin a tag or commit; if the launch is legitimate as-is, "
            "allowlist it with a reason and who confirmed it.",
            file=out,
        )
    return 0 if args["advisory"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
