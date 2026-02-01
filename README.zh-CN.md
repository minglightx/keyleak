# keyleak

**最小、最快的密钥检测工具，零误报。**

- **核心**：极简体积，零运行时依赖，两文件设计（一代码一规则）。TypeScript。
- **速度**：规则预编译，默认排除 node_modules 等编译目录，可选按大小/文件名/后缀过滤。
- **覆盖**：1000+ 条特征，100+ 种密钥类型（AWS、GitHub、OpenAI、Stripe、DB URL、PII 等）。
- **精准**：关键词预过滤、熵阈值、行内 `keyleak:ignore`；可用 `--disable` 按 id 关闭规则。

**运行**：`npx keyleak` · **输入**：stdin、文件或目录 · **输出**：text、JSON、CSV

## 快速开始

```bash
npx keyleak ./src
```

## 选项

| 选项 | 说明 |
|------|------|
| `--stdin` | 从标准输入读取内容 |
| `--format <json\|text\|csv>` | 输出格式（默认 text） |
| `--rule <path>` | 自定义规则 JSON 文件（默认 ./rules.json） |
| `--disable <id1,id2,...>` | 按 id 关闭规则（减少误报） |
| `--max-size <n>[k\|m]` | 跳过大于 n 字节的文件 |
| `--exclude-dir <name1,...>` | 排除目录名（默认 node_modules、.git、vendor、dist 等） |
| `--ext <.a,.b>` / `--exclude-ext` | 按文件后缀过滤 |
| `--debug` | 将每个扫描到的文件路径打印到 stderr |
| `--absolute` | 输出绝对路径（默认相对 cwd） |
| `--fail` | 发现密钥时退出码 1（用于 CI） |

位置参数：要扫描的文件或目录路径。未提供且未使用 `--stdin` 时不扫描。

## 使用场景

**Pre-commit**（`.git/hooks/pre-commit`）：`npx keyleak . --fail || exit 1`

**GitHub Actions**（`.github/workflows/keyleak.yml`）：

```yaml
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx keyleak . --fail
```

**Cursor**（`.cursor/hooks.json`）— [Hooks](https://cursor.com/docs/agent/hooks)：

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      { "command": "npx keyleak --stdin --fail && echo '{\"continue\":true}' || echo '{\"continue\":false,\"user_message\":\"Possible secrets detected.\"}'" }
    ]
  }
}
```

**Claude Code**（`.claude/settings.json`）— [Hooks](https://code.claude.com/docs/en/hooks)（退出码 2 = 拦截）：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "npx keyleak --stdin --fail || exit 2" }] }
    ]
  }
}
```

**Git Diff**：`git diff | npx keyleak --stdin`

**Git 历史扫描**：
- 全量历史：`git log -p | npx keyleak --stdin`
- 仅最新 N 条（如 100）：`git log -p -n 100 | npx keyleak --stdin`

## 行内忽略

在行内加上 `keyleak:ignore` 可跳过该行的密钥上报（如测试用例）。

## License

MIT
