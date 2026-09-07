本文是 `sessions.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 会话 {#sessions}

Pi 把对话保存为会话，以便你继续工作、从更早的轮次分支，并回顾之前的路径。

## 会话存储 {#session-storage}

会话会自动保存到 `~/.pi/agent/sessions/`，并按工作目录组织。每个会话是带树结构的 JSONL 文件。

```bash
pi -c                  # 继续最近一次会话
pi -r                  # 浏览并选择以往会话
pi --no-session        # 临时模式；不保存
pi --name "my task"    # 启动时设置会话显示名称
pi --session <path|id> # 使用指定会话文件或部分会话 ID
pi --fork <path|id>    # 将会话文件或部分会话 ID fork 到新会话
```

在交互模式中使用 `/session` 查看当前会话文件、会话 ID、消息数、token 和费用。

JSONL 文件格式和 SessionManager API 见 [会话格式](session-format.md)。

## 会话命令 {#session-commands}

| 命令 | 说明 |
|---------|-------------|
| `/resume` | 浏览并选择以往会话 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置当前会话显示名称 |
| `/session` | 显示会话信息 |
| `/tree` | 导航当前会话树 |
| `/fork` | 从之前的用户消息创建新会话 |
| `/clone` | 把当前活动分支复制到新会话 |
| `/compact [prompt]` | 总结较旧上下文；见 [压缩](compaction.md) |
| `/export [file]` | 将会话导出为 HTML |
| `/share` | 上传为私有 GitHub gist，并得到可分享的 HTML 链接 |

## 恢复与删除会话 {#resuming-and-deleting-sessions}

`/resume` 为当前项目打开交互式会话选择器。`pi -r` 在启动时打开同一个选择器。

在选择器中你可以：

- 输入以搜索
- 用 Ctrl+P 切换路径显示
- 用 Ctrl+S 切换排序模式
- 用 Ctrl+N 筛选为已命名会话
- 用 Ctrl+R 重命名
- 用 Ctrl+D 删除，然后确认

可用时，pi 会使用 `trash` CLI 删除，而不是永久移除文件。

## 命名会话 {#naming-sessions}

使用 `/name <name>` 设置人类可读的会话名称：

```text
/name Refactor auth module
```

启动时用 `--name` 或 `-n` 设置名称：

```bash
pi --name "Refactor auth module"
pi --name "CI audit" -p "Review this build failure"
```

已命名会话更容易在 `/resume` 和 `pi -r` 中找到。

## 用 `/tree` 分支 {#branching-with-tree}

会话以树的形式存储。每个条目都有 `id` 和 `parentId`，当前位置是活动叶子。`/tree` 让你跳到任意先前位置并从那里继续，而无需创建新文件。

<p align="center"><img src="images/tree-view.png" alt="Tree View" width="600"></p>

形状示例：

```text
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."
│     │  └─ assistant: "For approach A..."
│     │     └─ user: "That worked..."  ← 活动
│     └─ user: "Actually, approach B..."
│        └─ assistant: "For approach B..."
```

### 树控件 {#tree-controls}

| 按键 | 操作 |
|-----|--------|
| ↑/↓ | 导航可见条目 |
| ←/→ | 向上/向下翻页 |
| Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ | 折叠/展开，或在分支段之间跳转 |
| Shift+L | 为选中条目设置或清除标签 |
| Shift+T | 切换标签时间戳 |
| Enter | 选择条目 |
| Escape/Ctrl+C | 取消 |
| Ctrl+O | 循环筛选模式 |

筛选模式包括：default、no-tools、user-only、labeled-only 和 all。默认值通过 [设置](settings.md) 中的 `treeFilterMode` 配置。

### 选择行为 {#selection-behavior}

选择用户消息或自定义消息时：

1. 把叶子移到所选消息的父节点。
2. 把所选消息文本放入编辑器。
3. 允许你编辑并重新提交，从而创建新分支。

选择助手、工具、压缩或其他非用户条目时：

1. 把叶子移到该条目。
2. 编辑器保持为空。
3. 允许你从该点继续。

选择根用户消息会把叶子重置为空对话，并把原始提示放入编辑器。

## `/tree`、`/fork` 和 `/clone` {#tree-fork-and-clone}

| 特性 | `/tree` | `/fork` | `/clone` |
|---------|---------|---------|----------|
| 输出 | 同一会话文件 | 新会话文件 | 新会话文件 |
| 视图 | 完整树 | 用户消息选择器 | 当前活动分支 |
| 典型用途 | 在原地探索替代方案 | 从更早的提示开始新会话 | 在继续之前复制当前工作 |
| 摘要 | 可选的分支摘要 | 无 | 无 |

想把替代方案放在一起时用 `/tree`。想要单独的会话文件时用 `/fork` 或 `/clone`。

## 分支摘要 {#branch-summaries}

当 `/tree` 从一个分支切换到另一个分支时，pi 可以总结被放弃的分支，并把该摘要附加到新位置。这样可以保留你离开的那条路径上的重要上下文，而无需重放整个分支。

出现提示时，选择以下之一：

1. 不要摘要
2. 用默认提示总结
3. 用自定义关注说明总结

分支摘要内部机制和扩展钩子见 [压缩](compaction.md)。

## 会话格式 {#session-format}

会话文件是 JSONL，包含消息条目、模型更改、思考级别更改、标签、压缩、分支摘要和扩展条目。

解析器、扩展、SDK 用法以及完整 SessionManager API 见 [会话格式](session-format.md)。
