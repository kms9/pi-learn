本文是 `keybindings.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 快捷键 {#keybindings}

全部键盘快捷键都可以通过 `~/.pi/agent/keybindings.json` 自定义。每个动作可以绑定一个或多个按键。

配置文件使用与 pi 内部相同、扩展作者在 `keyHint()` 和注入的 `keybindings` 管理器中也使用的带命名空间的 keybinding id。

使用未命名空间 id（例如 `cursorUp` 或 `expandTools`）的旧配置会在启动时自动迁移到带命名空间的 id。

编辑 `keybindings.json` 后，在 pi 中运行 `/reload` 即可应用更改，无需重启会话。

## 按键格式 {#key-format}

`modifier+key`，其中修饰键为 `ctrl`、`shift`、`alt`、`super`（可组合），按键为：

- **字母：** `a-z`
- **数字：** `0-9`
- **特殊键：** `escape`、`esc`、`enter`、`return`、`tab`、`space`、`backspace`、`delete`、`insert`、`clear`、`home`、`end`、`pageUp`、`pageDown`、`up`、`down`、`left`、`right`
- **功能键：** `f1`-`f12`
- **符号：** `` ` ``、`-`、`=`、`[`、`]`、`\`、`;`、`'`、`,`、`.`、`/`、`!`、`@`、`#`、`$`、`%`、`^`、`&`、`*`、`(`、`)`、`_`、`+`、`|`、`~`、`{`、`}`、`:`、`<`、`>`、`?`

修饰键组合：`ctrl+shift+x`、`alt+ctrl+x`、`ctrl+shift+alt+x`、`super+k`、`ctrl+super+k`、`ctrl+1` 等。

`super` 绑定需要终端单独报告该修饰键，通常通过 Kitty keyboard protocol。没有该支持的终端可能无法工作。

## 全部动作 {#all-actions}

### TUI 编辑器光标移动 {#tui-editor-cursor-movement}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.editor.cursorUp` | `up` | 向上移动光标，在顶部浏览更早的历史 |
| `tui.editor.cursorDown` | `down` | 向下移动光标，在底部浏览更新的历史 |
| `tui.editor.historyPrevious` | *(无)* | 选择上一条提示历史 |
| `tui.editor.historyNext` | *(无)* | 选择下一条提示历史 |
| `tui.editor.cursorLeft` | `left`、`ctrl+b` | 向左移动光标 |
| `tui.editor.cursorRight` | `right`、`ctrl+f` | 向右移动光标 |
| `tui.editor.cursorWordLeft` | `alt+left`、`ctrl+left`、`alt+b` | 向左按词移动光标 |
| `tui.editor.cursorWordRight` | `alt+right`、`ctrl+right`、`alt+f` | 向右按词移动光标 |
| `tui.editor.cursorLineStart` | `home`、`ctrl+home`、`ctrl+a` | 移到行首 |
| `tui.editor.cursorLineEnd` | `end`、`ctrl+end`、`ctrl+e` | 移到行尾 |
| `tui.editor.jumpForward` | `ctrl+]` | 向前跳到字符 |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | 向后跳到字符 |
| `tui.editor.pageUp` | `pageUp`、`ctrl+pageUp` | 向上翻页滚动 |
| `tui.editor.pageDown` | `pageDown`、`ctrl+pageDown` | 向下翻页滚动 |

专用历史动作始终切换历史条目，无论光标在多行提示中的位置如何。主编辑器聚焦时，显式历史绑定优先于应用动作，因此把 `tui.editor.historyPrevious` 绑定到 `ctrl+p` 会在该上下文中覆盖模型循环，而不会改变选择器中的 `Ctrl+P`。

### TUI 编辑器删除 {#tui-editor-deletion}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.editor.deleteCharBackward` | `backspace` | 向后删除字符 |
| `tui.editor.deleteCharForward` | `delete`、`ctrl+d` | 向前删除字符 |
| `tui.editor.deleteWordBackward` | `ctrl+w`、`alt+backspace` | 向后删除单词 |
| `tui.editor.deleteWordForward` | `alt+d`、`alt+delete` | 向前删除单词 |
| `tui.editor.deleteToLineStart` | `ctrl+u` | 删除到行首 |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | 删除到行尾 |

### TUI 输入 {#tui-input}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.input.newLine` | `shift+enter`、`ctrl+j` | 插入新行 |
| `tui.input.submit` | `enter` | 提交输入 |
| `tui.input.tab` | `tab` | Tab / 自动补全 |

### TUI Kill Ring {#tui-kill-ring}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.editor.yank` | `ctrl+y` | 粘贴最近删除的文本 |
| `tui.editor.yankPop` | `alt+y` | yank 后循环已删除文本 |
| `tui.editor.undo` | `ctrl+-`（Windows 上为 `ctrl+z`；WSL 上为 `alt+z`） | 撤销上次编辑 |

### TUI 剪贴板与选择 {#tui-clipboard-and-selection}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.input.copy` | `ctrl+c` | 复制选区 |
| `tui.select.up` | `up` | 向上移动选择 |
| `tui.select.down` | `down` | 向下移动选择 |
| `tui.select.pageUp` | `pageUp` | 在列表中向上翻页 |
| `tui.select.pageDown` | `pageDown` | 在列表中向下翻页 |
| `tui.select.confirm` | `enter` | 确认选择 |
| `tui.select.cancel` | `escape`、`ctrl+c` | 取消选择 |

### TUI 全屏视口 {#tui-fullscreen-viewport}

这些动作在交互模式使用 `--tui-mode fullscreen` 时生效，目标是主记录滚动区域。双指触控板和鼠标滚轮会滚动指针下方的区域；若指针在固定的编辑器/状态/页脚停靠区上，则回退到记录。点击 OSC 8 超链接会用默认处理程序打开。用主键拖动可选择文本并复制到剪贴板；在记录顶部或底部边缘按住会自动滚入屏幕外内容。当记录向上滚动时，其底行会显示可点击的 “Jump to latest message” 标签，并展示 `tui.altScreen.bottom` 快捷键。终端特定的鼠标和触控板行为见 [终端配置](terminal-setup.md)。

全屏记录绑定优先于编辑器绑定。因此默认的无修饰导航键在全屏模式中控制记录，而其 `ctrl` 变体继续控制编辑器。在全屏模式之外，两种变体都控制编辑器。

记录搜索面板会显示配置的上一个/下一个快捷键以及可点击的箭头控件。再次按 `tui.altScreen.search`，或使用 `tui.altScreen.searchClose`，可关闭它。

| 按键 | 默认模式 | 全屏模式 |
|-----|--------------|-----------------|
| `home`、`end` | 编辑器 | 记录 |
| `ctrl+home`、`ctrl+end` | 编辑器 | 编辑器 |
| `pageUp`、`pageDown` | 编辑器 | 记录 |
| `ctrl+pageUp`、`ctrl+pageDown` | 编辑器 | 编辑器 |

这种路由仍可通过普通动作绑定配置。例如，`"tui.altScreen.pageUp": "ctrl+pageUp"` 会让 `pageUp` 在全屏模式中控制编辑器，而 `ctrl+pageUp` 控制记录。绑定 `tui.altScreen.halfPageUp` 和 `tui.altScreen.halfPageDown` 可做半页步进，或绑定 `tui.altScreen.lineUp` 和 `tui.altScreen.lineDown` 做单行步进。设置 `"tui.altScreen.pageUp": []` 会完全禁用该记录快捷键。用户绑定会替换该动作的默认值。

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `tui.altScreen.pageUp` | `pageUp` | 将记录向上滚动一页 |
| `tui.altScreen.pageDown` | `pageDown` | 将记录向下滚动一页 |
| `tui.altScreen.halfPageUp` | *(无)* | 将记录向上滚动半页 |
| `tui.altScreen.halfPageDown` | *(无)* | 将记录向下滚动半页 |
| `tui.altScreen.lineUp` | *(无)* | 将记录向上滚动一行 |
| `tui.altScreen.lineDown` | *(无)* | 将记录向下滚动一行 |
| `tui.altScreen.previousPrompt` | `ctrl+shift+up`、`ctrl+up`（Windows 和 WSL 上仅 `ctrl+up`） | 跳到上一条已标记消息 |
| `tui.altScreen.nextPrompt` | `ctrl+shift+down`、`ctrl+down`（Windows 和 WSL 上仅 `ctrl+down`） | 跳到下一条已标记消息 |
| `tui.altScreen.search` | `ctrl+shift+f`（Windows 和 WSL 上为 `ctrl+f`） | 搜索已渲染的记录 |
| `tui.altScreen.searchNext` | `enter`、`ctrl+g` | 搜索时选择下一个匹配项 |
| `tui.altScreen.searchPrevious` | `shift+enter`、`ctrl+shift+g` | 搜索时选择上一个匹配项 |
| `tui.altScreen.searchClose` | `escape` | 关闭记录搜索 |
| `tui.altScreen.top` | `home` | 滚动到记录开头 |
| `tui.altScreen.bottom` | `end` | 滚动到记录末尾并跟随新输出 |

### 应用 {#application}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.interrupt` | `escape` | 取消 / 中止 |
| `app.clear` | `ctrl+c` | 清空编辑器（第一次）/ 退出（第二次） |
| `app.exit` | `ctrl+d` | 退出（编辑器为空时） |
| `app.suspend` | `ctrl+z`（Windows 上无） | 挂起到后台 |
| `app.editor.external` | `ctrl+g` | 在外部编辑器中打开（`externalEditor`、`$VISUAL`、`$EDITOR`、Windows 上的 Notepad，或其他平台上的 `nano`） |
| `app.clipboard.pasteImage` | `ctrl+v`（Windows 和 WSL 上为 `alt+v`） | 从剪贴板粘贴图片或文本 |

### 会话 {#sessions}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.session.new` | *(无)* | 开始新会话（`/new`） |
| `app.session.tree` | *(无)* | 打开会话树导航器（`/tree`） |
| `app.session.fork` | *(无)* | Fork 当前会话（`/fork`） |
| `app.session.resume` | *(无)* | 打开会话恢复选择器（`/resume`） |
| `app.session.togglePath` | `ctrl+p` | 切换路径显示 |
| `app.session.toggleSort` | `ctrl+s` | 切换排序模式 |
| `app.session.toggleNamedFilter` | `ctrl+n` | 切换仅已命名筛选 |
| `app.session.rename` | `ctrl+r` | 重命名会话 |
| `app.session.delete` | `ctrl+d` | 删除会话 |
| `app.session.deleteNoninvasive` | `ctrl+backspace` | 查询为空时删除会话 |

### 模型与思考 {#models-and-thinking}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.model.select` | `ctrl+l` | 打开模型选择器 |
| `app.model.cycleForward` | `ctrl+p` | 循环到下一个模型 |
| `app.model.cycleBackward` | `shift+ctrl+p`（Windows 和 WSL 上为 `alt+p`） | 循环到上一个模型 |
| `app.models.save` | `ctrl+s` | 把所选默认模型或范围内模型配置保存到设置 |
| `app.thinking.cycle` | `shift+tab` | 循环切换思考级别 |
| `app.thinking.save` | `ctrl+s` | 把当前思考级别保存到设置 |
| `app.thinking.toggle` | `ctrl+t` | 折叠或展开思考块 |

### 显示与消息队列 {#display-and-message-queue}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.tools.expand` | `ctrl+o` | 折叠或展开工具输出 |
| `app.message.copy` | `ctrl+x` | 在 `/tree` 中复制所选消息；否则复制最后一条助手消息；当 `fullscreenCopyOnSelect` 禁用时，则复制当前全屏文本选区 |
| `app.message.followUp` | `alt+enter`（Windows 和 WSL 上为 `ctrl+q`） | 排队后续消息 |
| `app.message.dequeue` | `alt+up`（Windows 和 WSL 上为 `alt+q`） | 把已排队消息还原到编辑器 |

### 树导航 {#tree-navigation}

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.tree.foldOrUp` | `ctrl+left`、`alt+left` | 折叠当前分支段，或跳到上一段起点 |
| `app.tree.unfoldOrDown` | `ctrl+right`、`alt+right` | 展开当前分支段，或跳到下一段起点或分支末尾 |
| `app.tree.editLabel` | `shift+l` | 编辑所选树节点上的标签 |
| `app.tree.toggleLabelTimestamp` | `shift+t` | 切换树中的标签时间戳 |
| `app.tree.filter.default` | `ctrl+d` | 将树筛选设为默认视图 |
| `app.tree.filter.noTools` | `ctrl+t` | 切换隐藏工具结果的树筛选 |
| `app.tree.filter.userOnly` | `ctrl+u` | 切换只显示用户消息的树筛选 |
| `app.tree.filter.labeledOnly` | `ctrl+l` | 切换只显示已标记条目的树筛选 |
| `app.tree.filter.all` | `ctrl+a` | 切换显示全部条目的树筛选 |
| `app.tree.filter.cycleForward` | `ctrl+o` | 向前循环树筛选 |
| `app.tree.filter.cycleBackward` | `shift+ctrl+o` | 向后循环树筛选 |

### 范围内模型选择器 {#scoped-models-selector}

用于范围内模型选择器（通过 `/scoped-models` 打开）。

| Keybinding id | 默认值 | 说明 |
|--------|---------|-------------|
| `app.models.enableAll` | `ctrl+a` | 启用全部模型（或与当前搜索匹配的全部模型） |
| `app.models.clearAll` | `ctrl+x` | 清除全部模型（或与当前搜索匹配的全部模型） |
| `app.models.toggleProvider` | `ctrl+p` | 切换当前提供商的全部模型 |
| `app.models.reorderUp` | `alt+up` | 在循环顺序中把所选模型上移 |
| `app.models.reorderDown` | `alt+down` | 在循环顺序中把所选模型下移 |

## 自定义配置 {#custom-configuration}

创建 `~/.pi/agent/keybindings.json`：

```json
{
  "tui.editor.historyPrevious": "ctrl+p",
  "tui.editor.historyNext": "ctrl+n",
  "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

每个动作可以有单个按键或按键数组。用户配置会覆盖默认值。

在原生 Windows 上，`app.suspend` 没有默认绑定，因为 Windows 终端不支持 Unix 作业控制。如果手动绑定，pi 会显示状态消息而不是挂起。在 WSL 中，仍然适用正常的 Linux `ctrl+z`/`fg` 行为。

### Emacs 示例 {#emacs-example}

```json
{
  "tui.editor.historyPrevious": "ctrl+p",
  "tui.editor.historyNext": "ctrl+n",
  "tui.editor.cursorLeft": ["left", "ctrl+b"],
  "tui.editor.cursorRight": ["right", "ctrl+f"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+f"],
  "tui.editor.deleteCharForward": ["delete", "ctrl+d"],
  "tui.editor.deleteCharBackward": ["backspace", "ctrl+h"],
  "tui.input.newLine": ["shift+enter", "ctrl+j"]
}
```

### Vim 示例 {#vim-example}

```json
{
  "tui.editor.cursorUp": ["up", "alt+k"],
  "tui.editor.cursorDown": ["down", "alt+j"],
  "tui.editor.cursorLeft": ["left", "alt+h"],
  "tui.editor.cursorRight": ["right", "alt+l"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+w"]
}
```
