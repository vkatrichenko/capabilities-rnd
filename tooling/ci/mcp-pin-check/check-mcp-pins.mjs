#!/usr/bin/env node
/**
 * Check that every stdio MCP server in a repo's MCP config launches a pinned third party.
 *
 * Exists because all four BarHopping repos that configure stdio MCP servers execute a mutable
 * third party at session start (`:latest` image, `@canary`, a git URL with no ref) and the AWOS
 * `ai-security` audit's AIS-04 check passes every one of them. An MCP server runs on the
 * developer's machine with the developer's credentials; the config that names it is the supply
 * chain, and nothing else in the repo reads it.
 *
 * The verdict is TIERED, on purpose. A flat "unpinned = fail" is a purist rule that ops would
 * rightly disable — nobody bumps a 64-character digest by hand, and no Dependabot ecosystem
 * covers `.mcp.json`, so a digest pin rots until someone replaces it with `:latest` again. The
 * tiers follow the same split hops already made for GitHub Actions (W1.4: pin third-party
 * actions, leave GitHub-owned ones alone):
 *
 *   fail  — no ref at all on a git URL, a pre-release channel (`@canary`, `@next`, ...), or
 *           `npx -y` auto-accepting whatever resolves. Untrusted AND mutable. Nothing will ever
 *           bump it; nobody chose the version that runs.
 *   warn  — `:latest` / `@latest` / no tag. Mutable, but the publisher's stable channel. Reported,
 *           never blocks. Accept it in writing or pin to a tag — either is fine.
 *   pass  — a tag, an exact version, or a digest. A minor tag (`:1.11`) is enough; a digest is
 *           NOT required anywhere.
 *   skip  — `http`/`sse` servers (nothing to pin — the trust question is the URL) and local
 *           launchers (`poetry run`, `node ./x`, `python -m`) that execute the repo's own code.
 *
 * Usage:
 *   check-mcp-pins.mjs [--repo <path>] [--allowlist <file>] [--require-surface]
 *                      [--advisory] [--json]
 *
 * Exit codes: 0 clean or warn-only, 1 fail findings, 2 usage/IO error.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Where MCP servers get declared. `.mcp.json` is Claude Code's project-scoped file; the others are
// the same shape for other agents and cost nothing to include.
const CONFIG_FILES = [".mcp.json", ".claude/.mcp.json", ".cursor/mcp.json", ".vscode/mcp.json"];

const PRERELEASE = /^(?:canary|next|beta|alpha|rc|dev|nightly|insiders|main|master|head)$/i;
const EXACT_VERSION = /^v?\d+(?:\.\d+)*(?:[-+][\w.]+)?$/;
const DIGEST = /@sha256:[0-9a-f]{64}$/;

// Runners that execute code fetched from a registry or git at launch time.
const NODE_RUNNERS = new Set(["npx", "bunx", "pnpx"]);
const PY_RUNNERS = new Set(["uvx", "pipx"]);
// Flags to `docker run` that consume the next token, so it is not mistaken for the image.
const DOCKER_VALUE_FLAGS = new Set([
  "-e", "--env", "--env-file", "-v", "--volume", "--mount", "-p", "--publish", "--name",
  "-w", "--workdir", "--network", "--net", "--entrypoint", "--platform", "-u", "--user",
  "--label", "-l", "--add-host", "--cap-add", "--cap-drop", "--tmpfs", "--security-opt",
  "--memory", "-m", "--cpus", "--restart", "--log-driver", "--log-opt", "--pull", "--dns",
  "--hostname", "-h", "--device", "--gpus", "--shm-size", "--ulimit", "--group-add",
]);

class Finding {
  constructor({ rule, severity, label, why, detail }) {
    Object.assign(this, { rule, severity, label, why, detail });
  }
  get blocking() {
    return this.severity === "fail";
  }
  toString() {
    const mark = this.severity === "fail" ? "x" : "-";
    return `  ${mark} ${this.rule}  ${this.label}\n      ${this.why} — ${this.detail}`;
  }
}

// ---------------------------------------------------------------------------
// Version classification — one verdict per launch
// ---------------------------------------------------------------------------

/** { severity: "pass"|"warn"|"fail", rule, detail } for a package spec `name[@version]`. */
function classifyVersion(spec, refless) {
  if (refless) {
    return { severity: "fail", rule: "refless-git", detail: `${spec} — git URL with no tag or commit` };
  }
  if (spec == null) return { severity: "warn", rule: "unpinned", detail: "no version at all — resolves to latest" };
  if (/^latest$/i.test(spec)) return { severity: "warn", rule: "mutable-latest", detail: `@${spec}` };
  if (PRERELEASE.test(spec)) return { severity: "fail", rule: "prerelease-channel", detail: `@${spec}` };
  if (EXACT_VERSION.test(spec) || /^[0-9a-f]{7,40}$/i.test(spec)) return { severity: "pass", detail: `@${spec}` };
  // `^1.2`, `~1`, `>=2`, `1.x` — a range is a mutable pointer with a floor.
  return { severity: "warn", rule: "version-range", detail: `@${spec} — a range, resolves to whatever is newest inside it` };
}

/** Split `@scope/name@1.2.3` / `name@latest` / `name==1.2` into { name, version }. */
function splitSpec(token) {
  const pep = token.match(/^([^=@]+)==(.+)$/);
  if (pep) return { name: pep[1], version: pep[2] };
  const at = token.lastIndexOf("@");
  if (at > 0) return { name: token.slice(0, at), version: token.slice(at + 1) };
  return { name: token, version: null };
}

/** git+https://host/path[@ref] or [#ref] → { url, ref } */
function splitGit(token) {
  const m = token.match(/^(?:git\+)?((?:https?|ssh|git):\/\/[^@#\s]+|github:[^@#\s]+)(?:[@#](.+))?$/);
  if (!m) return null;
  return { url: m[1], ref: m[2] || null };
}

function classifyDocker(args) {
  const runIdx = args.indexOf("run");
  if (runIdx === -1) return { severity: "skip", detail: `docker ${args[0] || ""} — not a run` };
  let image = null;
  for (let i = runIdx + 1; i < args.length; i++) {
    const a = args[i];
    if (DOCKER_VALUE_FLAGS.has(a)) { i++; continue; }
    if (a.startsWith("-")) continue;
    image = a;
    break;
  }
  if (!image) return { severity: "warn", rule: "unparsed", detail: "docker run with no image token found" };
  if (DIGEST.test(image)) return { severity: "pass", detail: `${image.slice(0, image.indexOf("@") + 20)}…` };
  // Tag is after the last ':' that comes after the last '/'.
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  const tag = colon > slash ? image.slice(colon + 1) : null;
  const name = colon > slash ? image.slice(0, colon) : image;
  const v = classifyVersion(tag, false);
  return { ...v, detail: `${name}${tag ? ":" + tag : ""}${v.rule === "unpinned" ? " — no tag, resolves to latest" : ""}` };
}

function classifyNode(runner, args) {
  const autoYes = args.some((a) => a === "-y" || a === "--yes");
  const pkg = args.find((a) => !a.startsWith("-"));
  if (autoYes) {
    return { severity: "fail", rule: "auto-yes", detail: `${runner} -y ${pkg || ""} — installs whatever resolves without a prompt` };
  }
  if (!pkg) return { severity: "warn", rule: "unparsed", detail: `${runner} with no package token` };
  const git = splitGit(pkg);
  if (git) {
    const v = classifyVersion(git.ref, !git.ref);
    return { ...v, detail: `${git.url}${git.ref ? "#" + git.ref : ""}${v.rule && git.ref ? " — " + v.detail : ""}` };
  }
  const { name, version } = splitSpec(pkg);
  const v = classifyVersion(version, false);
  return { ...v, detail: `${name}${version ? "@" + version : ""}${v.rule && !version ? " — " + v.detail : ""}` };
}

function classifyPython(runner, args) {
  const fromIdx = args.indexOf("--from");
  const spec = fromIdx !== -1 ? args[fromIdx + 1] : args.find((a) => !a.startsWith("-"));
  if (!spec) return { severity: "warn", rule: "unparsed", detail: `${runner} with no package token` };
  const git = splitGit(spec);
  if (git) {
    const v = classifyVersion(git.ref, !git.ref);
    return { ...v, detail: `${git.url}${git.ref ? "@" + git.ref : ""}${v.rule && git.ref ? " — " + v.detail : ""}` };
  }
  const { name, version } = splitSpec(spec);
  const v = classifyVersion(version, false);
  return { ...v, detail: `${name}${version ? "@" + version : ""}${v.rule && !version ? " — " + v.detail : ""}` };
}

/** One server entry → { severity, rule?, detail }. */
export function classifyServer(server) {
  const type = server?.type || (server?.command ? "stdio" : server?.url ? "http" : "unknown");
  if (type !== "stdio") return { severity: "skip", detail: `${type} — remote, nothing to pin` };
  const command = String(server.command || "");
  const args = Array.isArray(server.args) ? server.args.map(String) : [];
  const bin = command.split("/").pop();

  if (bin === "docker" || bin === "podman") return classifyDocker(args);
  if (NODE_RUNNERS.has(bin)) return classifyNode(bin, args);
  if (PY_RUNNERS.has(bin)) return classifyPython(bin, args);
  if ((bin === "pnpm" || bin === "yarn") && args[0] === "dlx") return classifyNode(`${bin} dlx`, args.slice(1));
  if (bin === "uv" && args[0] === "tool" && args[1] === "run") return classifyPython("uv tool run", args.slice(2));
  // Everything else runs something already on disk: the repo's own module, a global binary, a
  // path. Pinning it is the job of the lockfile or the package manager, not this check.
  return { severity: "skip", detail: `${bin} ${args.slice(0, 3).join(" ")} — local launcher` };
}

// ---------------------------------------------------------------------------
// Repo scan
// ---------------------------------------------------------------------------

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`${path}: ${err.message}`);
  }
}

export function scanRepo(repoRootArg) {
  const repoRoot = resolve(repoRootArg);
  const findings = [];
  const servers = [];
  let configFiles = 0;

  for (const relPath of CONFIG_FILES) {
    const abs = join(repoRoot, relPath);
    if (!existsSync(abs)) continue;
    const cfg = readJson(abs);
    if (!cfg) continue;
    configFiles++;
    const label = relative(repoRoot, abs) || relPath;
    const entries = cfg.mcpServers || cfg.servers || {};
    for (const [name, server] of Object.entries(entries)) {
      const verdict = classifyServer(server);
      servers.push({ file: label, name, ...verdict });
      if (verdict.severity === "fail" || verdict.severity === "warn") {
        findings.push(
          new Finding({
            rule: verdict.rule,
            severity: verdict.severity,
            label: `${label}:mcpServers.${name}`,
            why: WHY[verdict.rule],
            detail: verdict.detail,
          }),
        );
      }
    }
  }
  return { findings, servers, summary: { configFiles, servers: servers.length } };
}

const WHY = {
  "refless-git": "runs a third party's default branch — nobody chose the version that executes",
  "prerelease-channel": "a pre-release channel changes and breaks underneath you by design",
  "auto-yes": "auto-accepts installing whatever the registry resolves at launch",
  "mutable-latest": "mutable, but the publisher's stable channel — pin a tag or record the acceptance",
  "unpinned": "no version at all — resolves to latest on every launch",
  "version-range": "a range floats inside its bounds",
  "unparsed": "the launch could not be parsed — check it by hand",
  "missing-surface": "no MCP config to check — a gate must not pass by having nothing to check",
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { repo: process.cwd(), allowlist: null, advisory: false, json: false, requireSurface: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = argv[++i];
    else if (a === "--allowlist") args.allowlist = argv[++i];
    else if (a === "--require-surface") args.requireSurface = true;
    else if (a === "--advisory") args.advisory = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.repo) throw new Error("--repo needs a path");
  return args;
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`mcp-pin-check: ${err.message}`);
    return 2;
  }
  if (args.help) {
    console.log("usage: check-mcp-pins.mjs [--repo <path>] [--allowlist <file>] [--require-surface] [--advisory] [--json]");
    return 0;
  }

  let result, allowed;
  try {
    allowed = args.allowlist ? readJson(args.allowlist) : {};
    if (allowed === null) throw new Error(`allowlist not found: ${args.allowlist}`);
    result = scanRepo(args.repo);
  } catch (err) {
    console.error(`mcp-pin-check: ${err.message}`);
    return 2;
  }

  if (args.requireSurface && result.summary.configFiles === 0) {
    result.findings.push(
      new Finding({
        rule: "missing-surface",
        severity: "fail",
        label: CONFIG_FILES[0],
        why: WHY["missing-surface"],
        detail: "--require-surface is set; a deleted or renamed .mcp.json would otherwise report clean",
      }),
    );
  }

  const kept = [];
  const suppressed = [];
  for (const f of result.findings) {
    const key = `${f.rule}@${f.label}`;
    if (allowed[key]) suppressed.push({ finding: f, reason: allowed[key], key });
    else kept.push(f);
  }

  if (args.json) {
    console.log(JSON.stringify({ summary: result.summary, servers: result.servers, findings: kept, suppressed }, null, 2));
  } else {
    console.log(`mcp-pin-check: ${args.repo}`);
    if (result.summary.configFiles === 0) {
      console.log("  no MCP config file — no MCP surface in this repo.");
    } else {
      for (const s of result.servers) {
        console.log(`  ${s.severity.padEnd(4)}  ${s.file}:${s.name}  ${s.detail}`);
      }
    }
    for (const s of suppressed) console.log(`  allowlisted: ${s.key} — ${s.reason}`);
    if (kept.length) {
      console.log("");
      for (const f of kept) console.log(f.toString());
    } else {
      console.log("  all clear.");
    }
  }

  const blocking = kept.filter((f) => f.blocking);
  if (blocking.length === 0) {
    if (kept.length && !args.json) console.log("\n  warnings only — pin a tag, or record the acceptance in docs/processes/security-notes.md.");
    return 0;
  }
  if (!args.json) {
    console.log(`\n  ${blocking.length} failing server(s). Pin a tag or commit; if the launch is legitimate as-is, allowlist it with a reason and who confirmed it.`);
  }
  return args.advisory ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
