"""Self-tests for check_mcp_pins. Offline, no network, no repo state.

Run: python3 -m unittest discover -s . -p 'test_check_mcp_pins.py'

Mirrors check-mcp-pins.test.mjs case for case. The first four tests are the real launches found
in the BarHopping repos on 2026-08-28; if one changes verdict the design changed, not the code.
"""

import io
import json
import os
import tempfile
import unittest

import check_mcp_pins as mp


def stdio(command, *args):
    return {"type": "stdio", "command": command, "args": list(args)}


def verdict(s):
    return mp.classify_server(s)["severity"]


def rule(s):
    return mp.classify_server(s).get("rule")


def repo_with(files):
    root = tempfile.mkdtemp(prefix="mcp-pin-check-")
    for rel, body in files.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(body if isinstance(body, str) else json.dumps(body))
    return root


def run(argv):
    out = io.StringIO()
    code = mp.main(argv, out=out)
    return code, out.getvalue()


MIXED = {
    "mcpServers": {
        "remote": {"type": "http", "url": "https://x/mcp"},
        "ok": stdio("docker", "run", "img:1.2"),
        "soft": stdio("docker", "run", "img:latest"),
        "hard": stdio("uvx", "--from", "git+https://github.com/a/b", "b"),
    }
}


class RealConfigs(unittest.TestCase):
    def test_hops_github_latest_is_warn(self):
        s = stdio(
            "docker",
            "run",
            "-i",
            "--rm",
            "-e",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "ghcr.io/github/github-mcp-server:latest",
        )
        self.assertEqual((verdict(s), rule(s)), ("warn", "mutable-latest"))

    def test_hops_mcp_serena_refless_is_fail(self):
        s = stdio(
            "uvx", "--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"
        )
        self.assertEqual((verdict(s), rule(s)), ("fail", "refless-git"))

    def test_barley_bedrock_at_latest_is_warn(self):
        s = {"command": "uvx", "args": ["awslabs.amazon-bedrock-agentcore-mcp-server@latest"]}
        self.assertEqual((verdict(s), rule(s)), ("warn", "mutable-latest"))

    def test_barley_prompt_kit_auto_yes_is_fail(self):
        s = stdio("npx", "-y", "shadcn@canary", "mcp")
        self.assertEqual((verdict(s), rule(s)), ("fail", "auto-yes"))


class Remedies(unittest.TestCase):
    def test_docker_minor_tag_passes(self):
        self.assertEqual(
            verdict(
                stdio(
                    "docker",
                    "run",
                    "-i",
                    "--rm",
                    "-e",
                    "TOKEN",
                    "ghcr.io/github/github-mcp-server:1.11",
                )
            ),
            "pass",
        )

    def test_docker_digest_passes(self):
        self.assertEqual(
            verdict(stdio("docker", "run", "ghcr.io/github/github-mcp-server@sha256:" + "a" * 64)),
            "pass",
        )

    def test_docker_flag_value_not_mistaken_for_image(self):
        s = stdio("docker", "run", "-e", "latest", "--name", "x", "ghcr.io/foo/bar")
        self.assertEqual((verdict(s), rule(s)), ("warn", "unpinned"))
        self.assertIn("ghcr.io/foo/bar", mp.classify_server(s)["detail"])

    def test_git_with_tag_or_commit_passes(self):
        self.assertEqual(
            verdict(
                stdio("uvx", "--from", "git+https://github.com/oraios/serena@v0.1.4", "serena")
            ),
            "pass",
        )
        self.assertEqual(
            verdict(
                stdio(
                    "uvx", "--from", "git+https://github.com/oraios/serena@" + "b" * 40, "serena"
                )
            ),
            "pass",
        )

    def test_exact_versions_pass(self):
        for s in (
            stdio("uvx", "awslabs.foo@1.2.3"),
            stdio("uvx", "awslabs.foo==1.2.3"),
            stdio("npx", "@scope/pkg@2.0.0", "mcp"),
            stdio("bunx", "pkg@0.4.1"),
            stdio("pnpm", "dlx", "pkg@0.4.1"),
        ):
            self.assertEqual(verdict(s), "pass", s)


class Tiers(unittest.TestCase):
    def test_prerelease_channels_fail(self):
        for ch in ("canary", "next", "beta", "alpha", "rc", "nightly"):
            self.assertEqual(rule(stdio("npx", f"pkg@{ch}")), "prerelease-channel", ch)
        self.assertEqual(rule(stdio("docker", "run", "img:main")), "prerelease-channel")

    def test_unpinned_and_range_warn(self):
        self.assertEqual(rule(stdio("npx", "@scope/pkg")), "unpinned")
        self.assertEqual(rule(stdio("npx", "pkg@^1.2")), "version-range")

    def test_remote_and_local_skipped(self):
        self.assertEqual(
            verdict({"type": "http", "url": "https://recruitment.awos.provectus.pro/mcp"}), "skip"
        )
        self.assertEqual(verdict({"url": "https://x/mcp"}), "skip")
        self.assertEqual(
            verdict(stdio("poetry", "run", "python", "-m", "mcp_servers.loop.server")), "skip"
        )
        self.assertEqual(verdict(stdio("node", "./dist/index.js")), "skip")
        self.assertEqual(verdict(stdio("/usr/local/bin/my-server")), "skip")


class RepoScanAndCli(unittest.TestCase):
    def test_scan_repo_one_finding_per_warn_or_fail(self):
        r = mp.scan_repo(repo_with({".mcp.json": MIXED}))
        self.assertEqual(r["summary"]["servers"], 4)
        self.assertEqual(
            sorted((f.rule, f.severity) for f in r["findings"]),
            [("mutable-latest", "warn"), ("refless-git", "fail")],
        )

    def test_exit_codes(self):
        root = repo_with({".mcp.json": MIXED})
        self.assertEqual(run(["--repo", root])[0], 1)
        self.assertEqual(run(["--repo", root, "--advisory"])[0], 0)
        warn_only = repo_with(
            {".mcp.json": {"mcpServers": {"soft": stdio("docker", "run", "img:latest")}}}
        )
        code, text = run(["--repo", warn_only])
        self.assertEqual(code, 0)
        self.assertIn("warnings only", text)

    def test_allowlist(self):
        root = repo_with(
            {
                ".mcp.json": MIXED,
                "allow.json": {
                    "refless-git@.mcp.json:mcpServers.hard": "accepted by X on 2026-08-28"
                },
            }
        )
        code, text = run(["--repo", root, "--allowlist", os.path.join(root, "allow.json")])
        self.assertEqual(code, 0)
        self.assertIn("allowlisted: refless-git@", text)

    def test_require_surface(self):
        root = repo_with({"README": ""})
        self.assertEqual(run(["--repo", root])[0], 0)
        code, text = run(["--repo", root, "--require-surface"])
        self.assertEqual(code, 1)
        self.assertIn("missing-surface", text)

    def test_json(self):
        code, text = run(["--repo", repo_with({".mcp.json": MIXED}), "--json"])
        data = json.loads(text)
        self.assertEqual(data["summary"]["configFiles"], 1)
        self.assertEqual(len(data["servers"]), 4)
        self.assertEqual(len(data["findings"]), 2)

    def test_malformed_json_is_usage_error(self):
        self.assertEqual(run(["--repo", repo_with({".mcp.json": "{ nope"})])[0], 2)


if __name__ == "__main__":
    unittest.main()
