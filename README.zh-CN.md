# keyleak

**最小、最快、规则最全的密钥检测工具，零误报。**

- **核心**：极简体积，零运行时依赖，两文件设计（一代码一规则）。TypeScript。
- **速度**：规则预编译，默认排除 node_modules 等编译目录，可选按大小/文件名/后缀过滤。
- **覆盖**：10,000+ 条特征，100+ 种密钥类型（AWS、GitHub、OpenAI、Stripe、DB URL、PII 等）。
- **精准**：关键词预过滤、熵阈值、行内 `keyleak:ignore`；可用 `--disable` 按 id 关闭规则。

**运行**：`npx keyleak` · **输入**：stdin、文件或目录 · **输出**：text（默认）、JSON、CSV

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

## 集成示例

- **Git diff**：`git diff | npx keyleak --stdin`
- **提交前**：`npx keyleak . --fail`
- **CI（如 GitHub Actions）**：`npx keyleak . --fail --format json`
- **Docker**：挂载仓库后执行 `npx keyleak /path`
- **发送给 AI 前**：内容经 `npx keyleak --stdin` 再发给 Copilot/Claude/Gemini

## 行内忽略

在行内加上 `keyleak:ignore` 可跳过该行的密钥上报（如测试用例）。

## License

MIT
