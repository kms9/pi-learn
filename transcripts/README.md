# transcripts/

Claude Code 会话记录（已脱敏），对应 `/workspace/dsh_squad_dev`（`feat/dsh-exp`，dsh / DSH squad 相关工作）。

## 来源

- 只收集 **Claude Code** 会话：`~/.claude/projects/-workspace-dsh-squad-dev/*.jsonl`（cwd = `/workspace/dsh_squad_dev`）。
  不收集 Pi（`~/.pi`）或其它 agent 的会话。
- 用 [SpecStory CLI](https://docs.specstory.com/integrations/terminal-coding-agents/usage) 导出为 markdown：
  `specstory sync claude --no-cloud-sync --local-time-zone`（时间为 America/Los_Angeles）。不用 `specstory run`。
- 每个文件一个会话，文件名为会话开始时间；文件头注释里有 Claude 会话 UUID。

## 脱敏

两层：

1. SpecStory 自带的密钥脱敏（默认开启）。
2. `tools/redact-transcripts.py`：运行时读取 `~/.secrets/*.env` 中名称含 KEY/TOKEN/SECRET/PASS 的变量值（从不打印），
   并按模式替换为 `[REDACTED]`：`sk-…` 类 key、Anthropic/OpenAI key、GitHub token（`ghp_`/`gho_`/`github_pat_` 等）、
   `Bearer`/`Authorization` 头、AWS key、私钥块、`password=`/`token=`/`api_key=`/`secret` 等赋值、JWT、Cookie 值、Slack/Google key。
   `--check` 模式只检测、有命中则退出 1。

之后再做独立复核（全部必须为零命中才提交）：密钥原值字面量搜索 + 正则扫描 + `gitleaks dir`（配置见
`tools/gitleaks-transcripts.toml`，仅额外放行 40 位 git commit SHA）。

赋值规则偏保守，测试代码里的假 token 字面量也会被替换。

## 刷新

```bash
/workspace/dsh_squad_dev-transcripts/tools/sync-claude-transcripts.sh
```

在独立 worktree `/workspace/dsh_squad_dev-transcripts` 中执行：导出 → 脱敏 → 复核扫描 → 只提交 `transcripts/` → 普通 push 到
`feat/dsh-exp`（从不 force）。任何扫描有命中即中止，不提交不推送。需要 `~/.local/bin/specstory` 和 `~/.local/bin/gitleaks`。

导出时 SpecStory 按 cwd 推导 Claude 项目键，脚本在空目录 `/workspace/dsh-squad-dev`（与 `/workspace/dsh_squad_dev`
映射到同一个键 `-workspace-dsh-squad-dev`）中运行，所有输出写到临时目录，因此不会改动主 worktree。
