# keyleak

**Smallest, fastest, most comprehensive secrets detecting tool — zero false positives.**

- **Core**: Minimal footprint, zero runtime dependencies, two-file design (one code file, one rules file). TypeScript.
- **Speed**: Precompiled rules, exclude dirs (e.g. `node_modules`) by default, optional filters (size, name, extension).
- **Coverage**: 1000+ patterns, 100+ secret types (AWS, GitHub, OpenAI, Stripe, DB URLs, PII, etc.).
- **Precision**: Keyword pre-filter, entropy threshold, inline `keyleak:ignore`; use `--disable` to tune.

**Run**: `npx keyleak` · **Input**: stdin, file, or directory · **Output**: text (default), JSON, or CSV

## Quick start

```bash
npx keyleak ./src
```

## Options

| Option | Description |
|--------|-------------|
| `--stdin` | Read content from standard input |
| `--format <json\|text\|csv>` | Output format (default: text) |
| `--rule <path>` | Custom rules JSON file (default: ./rules.json or package rules.json) |
| `--disable <id1,id2,...>` | Disable rules by id (reduce false positives) |
| `--max-size <n>[k\|m]` | Skip files larger than n bytes |
| `--exclude-dir <name1,...>` | Skip directory names (default: node_modules, .git, vendor, dist, …) |
| `--ext <.a,.b>` / `--exclude-ext` | Filter by file extension |
| `--debug` | Print each scanned file path to stderr |
| `--absolute` | Output absolute file paths (default: relative to cwd) |
| `--fail` | Exit with code 1 when any finding (for CI) |

Positional argument: file or directory path to scan. If omitted and not `--stdin`, no scan.

## Integration examples

- **Git diff**: `git diff | npx keyleak --stdin`
- **Pre-commit**: run `npx keyleak . --fail` before commit
- **CI (e.g. GitHub Actions)**: `npx keyleak . --fail --format json`
- **Docker**: mount repo and run `npx keyleak /path`
- **Send-to-AI guard**: pipe content through `npx keyleak --stdin` before sending to Copilot/Claude/Gemini

## Inline ignore

Add `keyleak:ignore` on a line to skip reporting secrets on that line (e.g. test fixtures).

## License

MIT
