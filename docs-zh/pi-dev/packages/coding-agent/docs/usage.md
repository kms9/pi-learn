本文是 `usage.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 使用 Pi {#using-pi}

本页汇总放不进快速开始页的日常用法细节。

## 交互模式 {#interactive-mode}

<p align="center"><img src="images/interactive-mode.png" alt="Interactive Mode" width="600"></p>

界面有四个主要区域：

- **启动标题** - 快捷键、已加载的上下文文件、提示词模板、技能和扩展
- **消息** - 用户消息、助手回复、工具调用、工具结果、通知、错误和扩展 UI
- **编辑器** - 输入区域；边框颜色表示当前思考级别
- **页脚** - 工作目录、会话名称、token/缓存用量、费用、上下文用量和当前模型。总量包括助手回复、工具报告的用量，以及摘要生成。

编辑器可以被内置 UI（例如 `/settings`）或自定义扩展 UI 临时替换。

### 编辑器功能 {#editor-features}

| 功能 | 操作方式 |
|---------|-----|
| 文件引用 | 输入 `@` 对项目文件做模糊搜索 |
| 路径补全 | 按 Tab 补全路径 |
| 多行输入 | Shift+Enter，或在 Windows Terminal 上用 Ctrl+Enter |
| 复制回复 | Ctrl+X 在 `/tree` 中复制所选消息；否则复制最后一条助手消息；当 `fullscreenCopyOnSelect` 禁用时，则复制当前全屏文本选区 |
| 图片 | 用 Ctrl+V 粘贴，Windows 上用 Alt+V，或拖入终端 |
| Shell 命令 | `!command` 运行并把输出发给模型 |
| 隐藏的 shell 命令 | `!!command` 运行但不把输出发给模型 |
| 外部编辑器 | Ctrl+G 打开 `externalEditor`、`$VISUAL`、`$EDITOR`、Windows 上的 Notepad，或其他平台上的 `nano` |

全部快捷键与自定义见 [快捷键](keybindings.md)。

## 斜杠命令 {#slash-commands}

在编辑器中输入 `/` 打开命令补全。扩展可以注册自定义命令，技能以 `/skill:name` 提供，提示词模板通过 `/templatename` 展开。

| 命令 | 说明 |
|---------|-------------|
| `/login`、`/logout` | 管理 OAuth 或 API key 凭据 |
| [`/llama`](llama-cpp.md) | 下载、加载和卸载 llama.cpp router 模型 |
| `/model` | 切换模型；在选择器中按 Ctrl+S 保存启动默认值 |
| `/thinking` | 切换思考级别；在选择器中按 Ctrl+S 保存启动默认值 |
| `/scoped-models` | 启用/禁用用于 Ctrl+P 循环的模型 |
| `/settings` | 主题、消息投递、传输及其他偏好 |
| `/resume` | 从以往会话中选择 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置会话显示名称 |
| `/session` | 显示会话文件、ID、消息、token 和费用 |
| `/tree` | 跳到会话中的任意点并从那里继续 |
| `/trust` | 保存项目信任决定，供以后会话使用 |
| `/fork` | 从之前的用户消息创建新会话 |
| `/clone` | 把当前活动分支复制到新会话 |
| `/compact [prompt]` | 手动压缩上下文，可附带自定义说明 |
| `/copy` | 把最后一条助手消息复制到剪贴板 |
| `/export [file]` | 将会话导出为 HTML 或 JSONL |
| `/import <file>` | 从 JSONL 文件导入并恢复会话 |
| `/share` | 上传为私有 GitHub gist，并得到可分享的 HTML 链接 |
| `/reload` | 重新加载快捷键、扩展、技能、提示词、主题和上下文文件 |
| `/hotkeys` | 显示全部键盘快捷键 |
| `/changelog` | 显示版本历史 |
| `/quit` | 退出 pi |

## 消息队列 {#message-queue}

你可以在 agent 仍在工作时提交消息：

- **Enter** 排队一条转向消息，在当前助手轮次完成其工具调用后投递。
- **Alt+Enter** 排队一条后续消息，在 agent 完成全部工作后投递。
- **Escape** 中止，并把已排队消息还原到编辑器。
- **Alt+Up** 把已排队消息取回编辑器。

在 Windows Terminal 上，Alt+Enter 默认是全屏。若希望 pi 收到该快捷键，请按 [终端配置](terminal-setup.md) 重新映射。

在 [设置](settings.md) 中用 `steeringMode` 和 `followUpMode` 配置投递方式。

## 会话 {#sessions}

会话会自动保存到 `~/.pi/agent/sessions/`，并按工作目录组织。

```bash
pi -c                  # 继续最近一次会话
pi -r                  # 浏览并选择会话
pi --no-session        # 临时模式；不保存
pi --name "my task"    # 启动时设置会话显示名称
pi --session <path|id> # 使用指定会话文件或会话 ID
pi --fork <path|id>    # 将会话 fork 到新会话文件
```

常用会话命令：

- `/session` 显示当前会话文件和 ID。
- `/tree` 导航文件内会话树，并可总结被放弃的分支。
- `/fork` 从更早的用户消息创建新会话。
- `/clone` 把当前活动分支复制到新会话文件。
- `/compact` 总结较旧消息以腾出上下文。

细节见 [会话](sessions.md) 和 [压缩](compaction.md)。

## 上下文文件 {#context-files}

Pi 启动时从以下位置加载 `AGENTS.md` 或 `CLAUDE.md`：

- `~/.pi/agent/AGENTS.md` 作为全局说明
- 从当前工作目录向上遍历的父目录
- 当前目录

如果某个目录包含 `AGENTS.override.md`，Pi 会加载它，而不是该目录中的 `AGENTS.md` 或 `CLAUDE.md`。其他目录的上下文文件仍会正常分层加载。

用上下文文件记录项目约定、命令、安全规则和偏好。用 `--no-context-files` 或 `-nc` 禁用加载。

### 系统提示文件 {#system-prompt-files}

用以下文件替换默认系统提示：

- 项目中的 `.pi/SYSTEM.md`
- 全局的 `~/.pi/agent/SYSTEM.md`

在任一位置使用 `APPEND_SYSTEM.md` 可追加到默认提示，而不替换它。

### 项目信任 {#project-trust}

交互启动时，如果项目文件夹包含项目本地设置、资源或项目 `.agents/skills`，并且 `~/.pi/agent/trust.json` 中没有该文件夹或父文件夹的已保存决定，pi 会在信任前询问。信任项目后，pi 可以加载 `.pi/settings.json` 和 `.pi` 资源、安装缺失的项目包，并执行项目扩展。

在信任决定之前，pi 只加载上下文文件、用户/全局扩展和 CLI `-e` 扩展，以便它们处理 `project_trust` 事件。项目本地扩展、由项目包管理的扩展以及项目设置，只在项目被信任后加载。切换到另一个 cwd 的会话、且当前进程尚未解析该目录的信任时，同样适用这种拆分。

非交互模式（`-p`、`--mode json` 和 `--mode rpc`）不会显示信任提示。若没有适用的已保存信任决定，它们使用全局设置中的 `defaultProjectTrust`：`ask`（默认）和 `never` 忽略这些项目资源，而 `always` 会信任它们。传入 `--approve`/`-a` 或 `--no-approve`/`-na` 可为单次运行覆盖项目信任。

如果没有扩展或已保存决定生效，`defaultProjectTrust` 控制回退行为。在 `~/.pi/agent/settings.json` 中将其设为 `"ask"`、`"always"` 或 `"never"`，或用 `/settings` 更改。

`pi config` 和包命令使用同样的项目信任流程，但 `pi update` 从不提示。传入 `--approve` 可在单次命令中信任项目本地设置，或传入 `--no-approve` 忽略它们。

在交互模式中使用 `/trust` 保存项目信任决定供以后会话使用，包括对直接父文件夹的信任。它只写入 `~/.pi/agent/trust.json`；当前会话不会重新加载，因此请重启 pi 使更改生效。


## 导出与分享会话 {#exporting-and-sharing-sessions}

使用 `/export [file]` 将会话写入 HTML。

使用 `/share` 上传私有 GitHub gist，并得到可分享的 HTML 链接。

如果你把 pi 用于开源工作，并希望发布会话供模型、提示词、工具和评测研究使用，见 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。它会将会话发布到 Hugging Face datasets。

## CLI 参考 {#cli-reference}

```bash
pi [options] [--] [@files...] [messages...]
```

### 包命令 {#package-commands}

```bash
pi install <source> [-l]     # 安装包，-l 表示项目本地
pi remove <source> [-l]      # 移除包
pi uninstall <source> [-l]   # remove 的别名
pi update [source|self|pi]   # 只更新 pi，或更新一个包源
pi update --all              # 更新 pi 和包；核对固定的 git refs
pi update --extensions       # 只更新包；核对固定的 git refs
pi update --models           # 只刷新模型目录
pi update --self             # 只更新 pi
pi update --extension <src>  # 更新一个包
pi list                      # 列出已安装的包
pi config                    # 启用/禁用包资源
```

这些命令管理 pi 包，并且 `pi update` 可以更新 pi CLI 安装。要卸载 pi 本身，见 [快速开始](quickstart.md#uninstall)。`pi config` 和项目包命令接受 `--approve`/`--no-approve`，以便在单次命令中信任或忽略项目本地设置。`pi update` 从不提示项目信任。

包源和安全说明见 [Pi 包](packages.md)。

### 模式 {#modes}

| 标志 | 说明 |
|------|-------------|
| default | 交互模式 |
| `-p`、`--print` | 打印回复并退出 |
| `--mode json` | 以 JSON 行输出全部事件；见 [JSON 模式](json.md) |
| `--mode rpc` | 通过 stdin/stdout 的 RPC 模式；见 [RPC 模式](rpc.md) |
| `--export <in> [out]` | 将会话导出为 HTML |

在打印模式中，pi 也会读取管道传入的 stdin，并把它合并进初始提示：

```bash
cat README.md | pi -p "Summarize this text"
```

### 模型选项 {#model-options}

| 选项 | 说明 |
|--------|-------------|
| `--provider <name>` | 提供商，例如 `anthropic`、`openai` 或 `google` |
| `--model <pattern>` | 模型模式或 ID；支持 `provider/id` 以及可选的 `:<thinking>` |
| `--api-key <key>` | API key，覆盖环境变量 |
| `--thinking <level>` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` |
| `--models <patterns>` | 用于 Ctrl+P 循环的逗号分隔模式 |
| `--list-models [search]` | 列出可用模型 |

### 会话选项 {#session-options}

| 选项 | 说明 |
|--------|-------------|
| `-c`、`--continue` | 继续最近一次会话 |
| `-r`、`--resume` | 浏览并选择会话 |
| `--session <path\|id>` | 使用指定会话文件或部分 UUID |
| `--fork <path\|id>` | 将会话文件或部分 UUID fork 到新会话 |
| `--session-dir <dir>` | 自定义会话存储目录 |
| `--no-session` | 临时模式；不保存 |
| `--name <name>`、`-n <name>` | 启动时设置会话显示名称 |

### 工具选项 {#tool-options}

| 选项 | 说明 |
|--------|-------------|
| `--tools <list>`、`-t <list>` | 允许指定的内置、扩展和自定义工具 |
| `--exclude-tools <list>`、`-xt <list>` | 禁用指定的内置、扩展和自定义工具 |
| `--no-builtin-tools`、`-nbt` | 禁用内置工具，但保留扩展/自定义工具 |
| `--no-tools`、`-nt` | 禁用全部工具 |

内置工具：`read`、`bash`、`powershell`（Windows）、`edit`、`write`、`grep`、`find`、`ls`。

### 资源选项 {#resource-options}

| 选项 | 说明 |
|--------|-------------|
| `-e`、`--extension <source>` | 从路径、npm 或 git 加载扩展；可重复 |
| `--no-extensions` | 禁用扩展发现 |
| `--skill <path>` | 加载技能；可重复 |
| `--no-skills` | 禁用技能发现 |
| `--prompt-template <path>` | 加载提示词模板；可重复 |
| `--no-prompt-templates` | 禁用提示词模板发现 |
| `--theme <path>` | 加载主题；可重复 |
| `--no-themes` | 禁用主题发现 |
| `--no-context-files`、`-nc` | 禁用 `AGENTS.md` 和 `CLAUDE.md` 发现 |

把 `--no-*` 与显式标志组合，可以精确加载所需内容并忽略设置。例如：

```bash
pi --no-extensions -e ./my-extension.ts
```

### 其他选项 {#other-options}

| 选项 | 说明 |
|--------|-------------|
| `--system-prompt <text>` | 替换默认提示；上下文文件和技能仍会追加 |
| `--append-system-prompt <text>` | 追加到系统提示 |
| `--tui-mode <mode>` | TUI 模式：`regular`（默认）或实验性的 `fullscreen` |
| `--use-theme <name[/name]>` | 为本轮运行设置初始交互主题，不更改设置 |
| `--verbose` | 强制详细启动 |
| `-a`、`--approve` | 本轮运行信任项目本地文件 |
| `-na`、`--no-approve` | 本轮运行忽略项目本地文件 |
| `--` | 停止解析选项；其余参数是提示或 `@file` 输入 |
| `-h`、`--help` | 显示帮助 |
| `-v`、`--version` | 显示版本 |

在 `fullscreen` 模式中，记录在终端视口内滚动，而排队消息、工作状态、扩展部件、编辑器和页脚固定在底部。鼠标/触控板输入滚动指针下方的区域；键盘视口操作始终可用。内联图片在支持 Kitty graphics protocol 的终端中可用，包括 Kitty 和 Ghostty。在 iTerm2 中它们渲染为文本占位符，因为它的内联图片协议无法在应用自管滚动期间删除或裁剪放置。在 `regular` 模式中，pi 使用主屏幕和终端自管回滚，iTerm2 内联图片继续正常渲染。终端特定设置和变通方法见 [终端配置](terminal-setup.md)。

在 `/settings` 中设置 **TUI mode**，可立即在 `regular` 和 `fullscreen` 之间切换，并为以后的会话选择默认值。**Fullscreen exit output** 控制退出全屏时是打印最终记录，还是恢复上一屏并只打印会话恢复提示。

### 文件参数 {#file-arguments}

用 `@` 作为文件前缀，把它们包含进消息：

```bash
pi @prompt.md "Answer this"
pi -p @screenshot.png "What's in this image?"
pi @code.ts @test.ts "Review these files"
```

### 示例 {#examples}

```bash
# 交互模式并带上初始提示
pi "List all .ts files in src/"

# 非交互
pi -p "Summarize this codebase"

# 以短横线开头的提示
pi -p -- "- Summarize these points"

# 非交互，并从管道读取 stdin
cat README.md | pi -p "Summarize this text"

# 命名的一次性会话
pi --name "release audit" -p "Audit this repository"

# 不同模型
pi --provider openai --model gpt-4o "Help me refactor"

# 带提供商前缀的模型
pi --model openai/gpt-4o "Help me refactor"

# 带思考级别简写的模型
pi --model sonnet:high "Solve this complex problem"

# 限制模型循环
pi --models "claude-*,gpt-4o"

# 只读模式
pi --tools read,grep,find,ls -p "Review the code"

# 禁用某一个扩展或内置工具，同时保留其余工具
pi --exclude-tools ask_question
```

## 设计原则 {#design-principles}

Pi 把核心保持精小，并把工作流特定行为推到扩展、技能、提示词模板和包中。

它有意不包含内置 MCP、子 agent、权限弹窗、plan 模式、待办或后台 bash。你可以把这些工作流做成扩展或包装载，或使用容器和 tmux 等外部工具。

完整理由见这篇 [博客文章](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)。
