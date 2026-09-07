本文是 `windows.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Windows 设置 {#windows-setup}

Pi 在 Windows 上默认使用 Git Bash。按以下顺序查找：

1. 来自 `~/.pi/agent/settings.json` 的自定义路径
2. Git Bash（`C:\Program Files\Git\bin\bash.exe`）
3. PATH 上的 `bash.exe`（Cygwin、MSYS2、WSL）

对大多数用户而言，[Git for Windows](https://git-scm.com/download/win) 已足够。

## PowerShell 工具 {#powershell-tool}

可选的 `powershell` 工具在可用时通过 `pwsh.exe` 运行命令，否则使用 Windows PowerShell。它以 `-NoProfile -NonInteractive -ExecutionPolicy Bypass` 启动 PowerShell。管理员强制的执行策略仍可能优先生效。

使用 `defaultTools` 替换面向模型的 `bash` 工具：

```json
{
  "defaultTools": ["read", "powershell", "edit", "write"]
}
```

或者在对比行为时同时启用两者：

```json
{
  "defaultTools": ["read", "bash", "powershell", "edit", "write"]
}
```

`!` 和 `!!` 编辑器命令仍使用 Bash。

## 自定义 Bash 路径 {#custom-bash-path}

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```
