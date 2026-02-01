#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "fs";
import { createInterface } from "readline";
import { basename, dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Types ---

interface Rule {
  id: string;
  name: string;
  regex: string;
  keywords?: string[];
  entropy?: number;
}

/** Rule with regex precompiled once for fast scanning */
type CompiledRule = Rule & { compiledRegex: RegExp | null };

interface Finding {
  ruleId: string;
  ruleName: string;
  match: string;
  file?: string;
  line?: number;
  start: number;
  end: number;
}

// --- Shannon entropy (no deps) ---

function entropy(s: string): number {
  if (!s || s.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  let sum = 0;
  const n = s.length;
  for (const k of Object.keys(freq)) {
    const p = freq[k]! / n;
    sum -= p * Math.log2(p);
  }
  return sum;
}

// --- Load rules ---

function loadRules(configPath: string): Rule[] {
  const raw = readFileSync(configPath, "utf-8");
  const data = JSON.parse(raw) as Rule[];
  if (!Array.isArray(data)) throw new Error("rules.json must be an array of rules");
  return data;
}

/** Precompile all rule regexes once to avoid per-line compilation (major speedup for large rule sets). */
function compileRules(rules: Rule[]): CompiledRule[] {
  return rules.map((r) => {
    let compiledRegex: RegExp | null = null;
    try {
      compiledRegex = new RegExp(r.regex, "g");
    } catch {
      /* invalid regex: skip at scan time */
    }
    return { ...r, compiledRegex };
  });
}

function getDefaultConfigPath(): string {
  const fromCwd = join(process.cwd(), "rules.json");
  try {
    readFileSync(fromCwd, "utf-8");
    return fromCwd;
  } catch {
    return join(__dirname, "..", "rules.json");
  }
}

// --- Scan engine ---

function* scanContent(
  content: string,
  rules: CompiledRule[],
  source?: string
): Generator<Finding> {
  const lines = content.split(/\r?\n/);
  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1]!;
    if (line.includes("keyleak:ignore")) continue;

    for (const rule of rules) {
      if (rule.compiledRegex == null) continue;
      if (rule.keywords && rule.keywords.length > 0) {
        const hasKeyword = rule.keywords.some((kw) =>
          line.toLowerCase().includes(kw.toLowerCase())
        );
        if (!hasKeyword) continue;
      }

      const re = rule.compiledRegex;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const matchText = m[0];
        if (rule.entropy != null) {
          const h = entropy(matchText);
          if (h < rule.entropy) continue;
        }
        yield {
          ruleId: rule.id,
          ruleName: rule.name,
          match: matchText,
          file: source,
          line: lineNum,
          start: m.index,
          end: m.index + matchText.length,
        };
      }
    }
  }
}

function redact(s: string, show = 4): string {
  if (s.length <= show * 2) return "*".repeat(s.length);
  return s.slice(0, show) + "..." + s.slice(-show);
}

// --- CLI ---

function printHelp(): void {
  const help = `keyleak - smallest, fastest secrets detecting tool - zero false positives.

Usage:
  keyleak <path>              Scan file or directory (required unless --stdin)
  keyleak --stdin              Read content from stdin and scan

Options:
  --stdin                      Read input from standard input
  --format <json|text|csv>     Output format (default: text)
  --rule <path>                Path to custom rules JSON file
  --disable <id1,id2,...>      Disable rules by id (reduce false positives)
  --max-size <n>[k|m]         Skip files larger than n bytes (k/m suffix)
  --include-name <pattern>    Only scan files whose name matches regex
  --exclude-name <pattern>     Skip files whose name matches regex
  --ext <.a,.b>               Only scan these extensions (e.g. .js,.ts)
  --exclude-ext <.a,.b>       Skip these extensions (e.g. .min.js,.map)
  --exclude-dir <name1,...>   Skip these directory names (default: node_modules,.git,vendor,...)
  --debug                     Print each file path as it is scanned (to stderr)
  --absolute                   Output absolute file paths (default: relative to cwd)
  --fail                       Exit with code 1 when any secret is found (for CI)
  -h, --help                   Show this help

Examples:
  keyleak ./src
  keyleak . --fail --format json
  keyleak . --disable generic-api-key,pii-emails
  git diff | keyleak --stdin
`;
  console.log(help);
}

function parseSize(s: string): number {
  const m = s.toLowerCase().match(/^(\d+)(k|m)?$/);
  if (!m) return 0;
  const n = parseInt(m[1]!, 10);
  if (m[2] === "k") return n * 1024;
  if (m[2] === "m") return n * 1024 * 1024;
  return n;
}

const DEFAULT_EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  "vendor",
  "__pycache__",
  "dist",
  "build",
  ".venv",
  "venv",
  ".idea",
  ".tox",
  "coverage",
  ".next",
  ".nuxt",
];

function parseArgs(argv: string[]): {
  help: boolean;
  stdin: boolean;
  format: "json" | "text" | "csv";
  rule: string | null;
  disable: string[];
  maxSize: number;
  includeName: string | null;
  excludeName: string | null;
  ext: string[] | null;
  excludeExt: string[] | null;
  excludeDir: string[];
  debug: boolean;
  absolute: boolean;
  fail: boolean;
  pathArg: string | null;
} {
  const args = argv.slice(2);
  let help = false;
  let stdin = false;
  let format: "json" | "text" | "csv" = "text";
  let rule: string | null = null;
  let disable: string[] = [];
  let maxSize = 0;
  let includeName: string | null = null;
  let excludeName: string | null = null;
  let ext: string[] | null = null;
  let excludeExt: string[] | null = null;
  let excludeDir: string[] = [];
  let debug = false;
  let absolute = false;
  let fail = false;
  let pathArg: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-h" || a === "--help") help = true;
    else if (a === "--stdin") stdin = true;
    else if (a === "--format" && args[i + 1]) {
      const f = args[++i]!;
      if (f === "json" || f === "text" || f === "csv") format = f;
    } else if (a === "--rule" && args[i + 1]) rule = args[++i]!;
    else if (a === "--disable" && args[i + 1]) {
      disable = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--max-size" && args[i + 1]) maxSize = parseSize(args[++i]!);
    else if (a === "--include-name" && args[i + 1]) includeName = args[++i]!;
    else if (a === "--exclude-name" && args[i + 1]) excludeName = args[++i]!;
    else if (a === "--ext" && args[i + 1]) {
      ext = args[++i]!.split(",").map((s) => {
        const x = s.trim().toLowerCase();
        return x.startsWith(".") ? x : "." + x;
      }).filter(Boolean);
    } else if (a === "--exclude-ext" && args[i + 1]) {
      excludeExt = args[++i]!.split(",").map((s) => {
        const x = s.trim().toLowerCase();
        return x.startsWith(".") ? x : "." + x;
      }).filter(Boolean);
    } else if (a === "--exclude-dir" && args[i + 1]) {
      excludeDir = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--debug") debug = true;
    else if (a === "--absolute") absolute = true;
    else if (a === "--fail") fail = true;
    else if (!a.startsWith("-")) pathArg = a;
  }

  return { help, stdin, format, rule, disable, maxSize, includeName, excludeName, ext, excludeExt, excludeDir, debug, absolute, fail, pathArg };
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) chunks.push(line + "\n");
  return chunks.join("");
}

function isTextFile(path: string): boolean {
  const ext = path.toLowerCase();
  const skip = [
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".mp3", ".mp4", ".woff", ".woff2",
    ".ttf", ".eot", ".exe", ".dll", ".so", ".dylib", ".bin",
  ];
  return !skip.some((e) => ext.endsWith(e));
}

interface FileFilters {
  maxSize: number;
  includeName: string | null;
  excludeName: string | null;
  ext: string[] | null;
  excludeExt: string[] | null;
}

function shouldScanFile(filePath: string, filters: FileFilters): boolean {
  if (filters.maxSize > 0) {
    try {
      if (statSync(filePath).size > filters.maxSize) return false;
    } catch {
      return false;
    }
  }
  const name = basename(filePath);
  const lower = filePath.toLowerCase();
  if (filters.includeName) {
    try {
      if (!new RegExp(filters.includeName).test(name)) return false;
    } catch {
      return false;
    }
  }
  if (filters.excludeName) {
    try {
      if (new RegExp(filters.excludeName).test(name)) return false;
    } catch {
      return false;
    }
  }
  if (filters.ext?.length) {
    if (!filters.ext.some((e) => lower.endsWith(e))) return false;
  }
  if (filters.excludeExt?.length) {
    if (filters.excludeExt.some((e) => lower.endsWith(e))) return false;
  }
  return true;
}

function* walkDir(
  dir: string,
  base: string,
  excludeDirs: Set<string>
): Generator<string> {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name.startsWith(".") || excludeDirs.has(e.name)) continue;
    if (e.isDirectory()) {
      yield* walkDir(join(dir, e.name), rel, excludeDirs);
    } else if (e.isFile() && isTextFile(rel)) {
      yield join(dir, e.name);
    }
  }
}

function collectFindings(
  rules: CompiledRule[],
  opts: {
    stdin: boolean;
    pathArg: string | null;
    filters: FileFilters;
    excludeDirs: Set<string>;
    debug: boolean;
  }
): Finding[] {
  const findings: Finding[] = [];
  const { filters, excludeDirs, debug } = opts;

  if (opts.stdin) {
    return findings;
  }

  if (opts.pathArg) {
    const p = resolve(process.cwd(), opts.pathArg);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(p);
    } catch {
      console.error(`keyleak: cannot access '${opts.pathArg}'`);
      process.exit(1);
    }
    if (stat.isFile()) {
      if (!shouldScanFile(p, filters)) return findings;
      if (debug) console.error(p);
      const content = readFileSync(p, "utf-8");
      for (const f of scanContent(content, rules, p)) findings.push(f);
    } else if (stat.isDirectory()) {
      for (const filePath of walkDir(p, "", excludeDirs)) {
        if (!shouldScanFile(filePath, filters)) continue;
        if (debug) console.error(filePath);
        try {
          const content = readFileSync(filePath, "utf-8");
          for (const f of scanContent(content, rules, filePath)) findings.push(f);
        } catch {
          // skip binary or unreadable
        }
      }
    }
  }

  return findings;
}

function formatOutput(
  findings: Finding[],
  format: "json" | "text" | "csv",
  opts: { cwd: string; absolute: boolean }
): string {
  const fileDisplay = (f: Finding) =>
    f.file
      ? opts.absolute
        ? f.file
        : relative(opts.cwd, f.file)
      : "stdin";

  if (format === "json") {
    const out = findings.map((f) => ({
      ...f,
      file: fileDisplay(f),
      match: redact(f.match),
    }));
    return JSON.stringify({ count: findings.length, findings: out }, null, 2);
  }
  if (format === "csv") {
    const header = "ruleId,ruleName,match,file,line,start,end";
    const rows = findings.map(
      (f) =>
        `${f.ruleId},${f.ruleName},"${redact(f.match).replace(/"/g, '""')}",${fileDisplay(f)},${f.line ?? ""},${f.start},${f.end}`
    );
    return [header, ...rows].join("\n");
  }
  const lines = findings.map(
    (f) =>
      `${fileDisplay(f)}:${f.line ?? "-"}: ${f.ruleId}: ${redact(f.match)}`
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.stdin && !opts.pathArg) {
    printHelp();
    process.exit(1);
  }

  const configPath = opts.rule ?? getDefaultConfigPath();

  let rules: Rule[];
  try {
    rules = loadRules(configPath);
  } catch (e) {
    console.error("keyleak: failed to load rules:", (e as Error).message);
    process.exit(1);
  }

  if (opts.disable.length > 0) {
    const set = new Set(opts.disable);
    rules = rules.filter((r) => !set.has(r.id));
  }

  const compiledRules = compileRules(rules);

  const filters: FileFilters = {
    maxSize: opts.maxSize,
    includeName: opts.includeName,
    excludeName: opts.excludeName,
    ext: opts.ext,
    excludeExt: opts.excludeExt,
  };

  const excludeDirs = new Set([...DEFAULT_EXCLUDE_DIRS, ...opts.excludeDir]);

  let findings: Finding[];
  if (opts.stdin) {
    const content = await readStdin();
    findings = [...scanContent(content, compiledRules)];
  } else {
    findings = collectFindings(compiledRules, {
      stdin: opts.stdin,
      pathArg: opts.pathArg,
      filters,
      excludeDirs,
      debug: opts.debug,
    });
  }

  const cwd = process.cwd();
  const out = formatOutput(findings, opts.format, { cwd, absolute: opts.absolute });
  if (out) console.log(out);

  if (opts.fail && findings.length > 0) process.exit(1);
}

main();
