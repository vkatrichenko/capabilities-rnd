/**
 * Self-tests for check-mcp-pins.mjs. Offline, no network, no repo state — fixtures are written to
 * a temp directory at run time so this file ships into a target repo's `scripts/` unchanged.
 *
 * The four "real config" tests reproduce the exact launches found in the BarHopping repos on
 * 2026-08-28 (research/findings/satellite-repos-1c.md). They are the reason the tiers look the way
 * they do; if one of them changes verdict, the design changed, not just the code.
 *
 * Run: node --test check-mcp-pins.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { classifyServer, scanRepo, main } from "./check-mcp-pins.mjs";

const stdio = (command, ...args) => ({ type: "stdio", command, args });
const verdict = (s) => classifyServer(s).severity;
const rule = (s) => classifyServer(s).rule;

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), "mcp-pin-check-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof body === "string" ? body : JSON.stringify(body));
  }
  return root;
}

function capture(fn) {
  const out = [];
  const log = console.log, err = console.error;
  console.log = (...a) => out.push(a.join(" "));
  console.error = (...a) => out.push(a.join(" "));
  try { return { code: fn(), text: out.join("\n") }; } finally { console.log = log; console.error = err; }
}

// --- the real configs -------------------------------------------------------------------------

test("hops github: docker :latest from a trusted publisher is warn, not fail", () => {
  const s = stdio("docker", "run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server:latest");
  assert.equal(verdict(s), "warn");
  assert.equal(rule(s), "mutable-latest");
});

test("hops-mcp serena: uvx --from git URL with no ref is fail", () => {
  const s = stdio("uvx", "--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server");
  assert.equal(verdict(s), "fail");
  assert.equal(rule(s), "refless-git");
});

test("barley bedrock-agentcore: uvx pkg@latest is warn", () => {
  const s = { command: "uvx", args: ["awslabs.amazon-bedrock-agentcore-mcp-server@latest"] };
  assert.equal(verdict(s), "warn");
  assert.equal(rule(s), "mutable-latest");
});

test("barley prompt-kit: npx -y shadcn@canary is fail (auto-yes wins over channel)", () => {
  const s = stdio("npx", "-y", "shadcn@canary", "mcp");
  assert.equal(verdict(s), "fail");
  assert.equal(rule(s), "auto-yes");
});

// --- the remedies pass ------------------------------------------------------------------------

test("docker minor tag passes — a digest is not required", () => {
  assert.equal(verdict(stdio("docker", "run", "-i", "--rm", "-e", "TOKEN", "ghcr.io/github/github-mcp-server:1.11")), "pass");
});

test("docker digest passes", () => {
  const img = "ghcr.io/github/github-mcp-server@sha256:" + "a".repeat(64);
  assert.equal(verdict(stdio("docker", "run", img)), "pass");
});

test("docker: -e VALUE is not mistaken for the image; no tag is warn/unpinned", () => {
  const s = stdio("docker", "run", "-e", "latest", "--name", "x", "ghcr.io/foo/bar");
  assert.equal(verdict(s), "warn");
  assert.equal(rule(s), "unpinned");
  assert.match(classifyServer(s).detail, /ghcr\.io\/foo\/bar/);
});

test("git URL with a tag passes; with a commit passes", () => {
  assert.equal(verdict(stdio("uvx", "--from", "git+https://github.com/oraios/serena@v0.1.4", "serena")), "pass");
  assert.equal(verdict(stdio("uvx", "--from", "git+https://github.com/oraios/serena@" + "b".repeat(40), "serena")), "pass");
});

test("exact versions pass across runners", () => {
  assert.equal(verdict(stdio("uvx", "awslabs.foo@1.2.3")), "pass");
  assert.equal(verdict(stdio("uvx", "awslabs.foo==1.2.3")), "pass");
  assert.equal(verdict(stdio("npx", "@scope/pkg@2.0.0", "mcp")), "pass");
  assert.equal(verdict(stdio("bunx", "pkg@0.4.1")), "pass");
  assert.equal(verdict(stdio("pnpm", "dlx", "pkg@0.4.1")), "pass");
});

// --- the tiers ---------------------------------------------------------------------------------

test("pre-release channels fail without -y", () => {
  for (const ch of ["canary", "next", "beta", "alpha", "rc", "nightly"]) {
    assert.equal(rule(stdio("npx", `pkg@${ch}`)), "prerelease-channel", ch);
  }
  assert.equal(rule(stdio("docker", "run", "img:main")), "prerelease-channel");
});

test("npx with no version is warn/unpinned; a range is warn/version-range", () => {
  assert.equal(rule(stdio("npx", "@scope/pkg")), "unpinned");
  assert.equal(rule(stdio("npx", "pkg@^1.2")), "version-range");
});

test("http/sse servers and local launchers are skipped", () => {
  assert.equal(verdict({ type: "http", url: "https://recruitment.awos.provectus.pro/mcp" }), "skip");
  assert.equal(verdict({ url: "https://x/mcp" }), "skip");
  assert.equal(verdict(stdio("poetry", "run", "python", "-m", "mcp_servers.loop.server")), "skip");
  assert.equal(verdict(stdio("node", "./dist/index.js")), "skip");
  assert.equal(verdict(stdio("/usr/local/bin/my-server")), "skip");
});

// --- repo scan + CLI ---------------------------------------------------------------------------

const MIXED = {
  mcpServers: {
    remote: { type: "http", url: "https://x/mcp" },
    ok: stdio("docker", "run", "img:1.2"),
    soft: stdio("docker", "run", "img:latest"),
    hard: stdio("uvx", "--from", "git+https://github.com/a/b", "b"),
  },
};

test("scanRepo reads .mcp.json and reports one finding per warn/fail", () => {
  const r = scanRepo(repoWith({ ".mcp.json": MIXED }));
  assert.equal(r.summary.servers, 4);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.severity]).sort(), [["mutable-latest", "warn"], ["refless-git", "fail"]]);
});

test("exit 1 on fail, 0 with --advisory, 0 when warn-only", () => {
  const root = repoWith({ ".mcp.json": MIXED });
  assert.equal(capture(() => main(["--repo", root])).code, 1);
  assert.equal(capture(() => main(["--repo", root, "--advisory"])).code, 0);
  const warnOnly = repoWith({ ".mcp.json": { mcpServers: { soft: stdio("docker", "run", "img:latest") } } });
  const r = capture(() => main(["--repo", warnOnly]));
  assert.equal(r.code, 0);
  assert.match(r.text, /warnings only/);
});

test("allowlist suppresses by rule@label with a reason", () => {
  const root = repoWith({
    ".mcp.json": MIXED,
    "allow.json": { "refless-git@.mcp.json:mcpServers.hard": "accepted by X on 2026-08-28" },
  });
  const r = capture(() => main(["--repo", root, "--allowlist", join(root, "allow.json")]));
  assert.equal(r.code, 0);
  assert.match(r.text, /allowlisted: refless-git@/);
});

test("--require-surface fails an absent config; without it, clean", () => {
  const root = repoWith({ "README": "" });
  assert.equal(capture(() => main(["--repo", root])).code, 0);
  const r = capture(() => main(["--repo", root, "--require-surface"]));
  assert.equal(r.code, 1);
  assert.match(r.text, /missing-surface/);
});

test("--json emits servers, findings and summary", () => {
  const r = capture(() => main(["--repo", repoWith({ ".mcp.json": MIXED }), "--json"]));
  const data = JSON.parse(r.text);
  assert.equal(data.summary.configFiles, 1);
  assert.equal(data.servers.length, 4);
  assert.equal(data.findings.length, 2);
});

test("malformed JSON is a usage error (2), not a pass", () => {
  const r = capture(() => main(["--repo", repoWith({ ".mcp.json": "{ nope" })]));
  assert.equal(r.code, 2);
});
