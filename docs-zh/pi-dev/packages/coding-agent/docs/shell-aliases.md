本文是 `shell-aliases.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Shell 别名 {#shell-aliases}

Pi 以非交互模式运行 bash（`bash -c`），默认不会展开别名。

要启用你的 shell 别名，请在 `~/.pi/agent/settings.json` 中添加：

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\neval \"$(grep '^alias ' ~/.zshrc)\""
}
```

按你的 shell 配置调整路径（`~/.zshrc`、`~/.bashrc` 等）。
