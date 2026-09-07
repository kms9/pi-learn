本文是 `themes.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以创建主题。让它按你的环境构建一个即可。

# 主题 {#themes}

主题是定义 TUI 颜色的 JSON 文件。

## 目录 {#table-of-contents}

- [位置](#locations)
- [选择主题](#selecting-a-theme)
- [创建自定义主题](#creating-a-custom-theme)
- [主题格式](#theme-format)
- [颜色 token](#color-tokens)
- [颜色值](#color-values)
- [提示](#tips)

## 位置 {#locations}

Pi 从以下位置加载主题：

- 内置：`dark`、`light`
- 全局：`~/.pi/agent/themes/*.json`
- 项目：`.pi/themes/*.json`（仅在项目被信任之后）
- 包：`themes/` 目录或 `package.json` 中的 `pi.themes` 条目
- 设置：`themes` 数组，包含文件或目录
- CLI：`--theme <path>`（可重复）

使用 `--no-themes` 禁用发现。

## 选择主题 {#selecting-a-theme}

通过 `/settings` 或在 `settings.json` 中选择主题：

```json
{
  "theme": "my-theme"
}
```

首次运行时，pi 会检测终端背景，并默认使用 `dark` 或 `light`。

### 初始主题 {#initial-theme}

在不更改已保存设置的情况下，以某个主题启动一次交互运行：

```bash
pi --use-theme light
```

要跟随终端外观，使用 `lightTheme/darkTheme` 语法：

```bash
pi --use-theme light/dark
```

该 CLI 值是本次运行的初始主题。之后在 `/settings` 中选择其他主题会立即生效，并按常规保存。

## 创建自定义主题 {#creating-a-custom-theme}

1. 创建主题文件：

```bash
mkdir -p ~/.pi/agent/themes
vim ~/.pi/agent/themes/my-theme.json
```

2. 用全部必需颜色定义主题（参见 [颜色 token](#color-tokens)）：

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "primary": "#00aaff",
    "secondary": 242
  },
  "colors": {
    "accent": "primary",
    "border": "primary",
    "borderAccent": "#00ffff",
    "borderMuted": "secondary",
    "success": "#00ff00",
    "error": "#ff0000",
    "warning": "#ffff00",
    "muted": "secondary",
    "dim": 240,
    "text": "",
    "thinkingText": "secondary",
    "selectedBg": "#2d2d30",
    "scrollbarTrack": "secondary",
    "scrollbarThumb": "",
    "searchMatchBg": "#2d2d30",
    "searchMatchText": "",
    "userMessageBg": "#2d2d30",
    "userMessageText": "",
    "customMessageBg": "#2d2d30",
    "customMessageText": "",
    "customMessageLabel": "primary",
    "toolPendingBg": "#1e1e2e",
    "toolSuccessBg": "#1e2e1e",
    "toolErrorBg": "#2e1e1e",
    "toolTitle": "primary",
    "toolOutput": "",
    "mdHeading": "#ffaa00",
    "mdLink": "primary",
    "mdLinkUrl": "secondary",
    "mdCode": "#00ffff",
    "mdCodeBlock": "",
    "mdCodeBlockBorder": "secondary",
    "mdQuote": "secondary",
    "mdQuoteBorder": "secondary",
    "mdHr": "secondary",
    "mdListBullet": "#00ffff",
    "toolDiffAdded": "#00ff00",
    "toolDiffRemoved": "#ff0000",
    "toolDiffContext": "secondary",
    "syntaxComment": "secondary",
    "syntaxKeyword": "primary",
    "syntaxFunction": "#00aaff",
    "syntaxVariable": "#ffaa00",
    "syntaxString": "#00ff00",
    "syntaxNumber": "#ff00ff",
    "syntaxType": "#00aaff",
    "syntaxOperator": "primary",
    "syntaxPunctuation": "secondary",
    "thinkingOff": "secondary",
    "thinkingMinimal": "primary",
    "thinkingLow": "#00aaff",
    "thinkingMedium": "#00ffff",
    "thinkingHigh": "#ff00ff",
    "thinkingXhigh": "#ff0000",
    "thinkingMax": "#ff0088",
    "bashMode": "#ffaa00"
  }
}
```

3. 通过 `/settings` 选择该主题。

**热重载：** 编辑当前活动的自定义主题文件时，pi 会自动重新加载，以便立即看到视觉反馈。

## 主题格式 {#theme-format}

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "blue": "#0066cc",
    "gray": 242
  },
  "colors": {
    "accent": "blue",
    "muted": "gray",
    "text": "",
    ...
  }
}
```

- `name` 必需，必须唯一，且不能包含 `/`。
- `vars` 可选。在此定义可复用颜色，然后在 `colors` 中引用。
- `colors` 必须定义全部 53 个必需 token。`thinkingMax` 以及两个搜索高亮 token 是可选的，并使用下方列出的回退值。

`$schema` 字段可启用编辑器自动补全与校验。

## 颜色 token {#color-tokens}

每个主题必须定义全部 53 个必需颜色 token。可选 token 用于保持与现有主题的兼容：`thinkingMax` 回退到 `thinkingXhigh`，`searchMatchBg` 回退到 `selectedBg`，`searchMatchText` 回退到 `text`。其他搜索匹配使用 `searchMatchBg` 上的 `searchMatchText` 并加下划线；当前匹配会反转该前景/背景对，并使用粗体文本。

### 核心 UI（13 种颜色） {#core-ui-13-colors}

| Token | 用途 |
|-------|---------|
| `accent` | 主强调色（logo、选中项、光标） |
| `border` | 普通边框 |
| `borderAccent` | 高亮边框 |
| `borderMuted` | 弱化边框（编辑器） |
| `success` | 成功状态 |
| `error` | 错误状态 |
| `warning` | 警告状态 |
| `muted` | 次要文本 |
| `dim` | 第三级文本 |
| `text` | 默认文本（通常为 `""`） |
| `thinkingText` | thinking 块文本 |
| `scrollbarTrack` | 全屏滚动条轨道前景 |
| `scrollbarThumb` | 全屏滚动条滑块前景，普通与展开状态共用 |

### 背景与内容（11 个必需，2 个可选） {#backgrounds--content-11-required-2-optional}

| Token | 用途 |
|-------|---------|
| `selectedBg` | 选中行背景 |
| `searchMatchBg` | 会话记录搜索匹配背景与当前匹配文本；可选，回退到 `selectedBg` |
| `searchMatchText` | 会话记录搜索匹配文本与当前匹配背景；可选，回退到 `text` |
| `userMessageBg` | 用户消息背景 |
| `userMessageText` | 用户消息文本 |
| `customMessageBg` | 扩展消息背景 |
| `customMessageText` | 扩展消息文本 |
| `customMessageLabel` | 扩展消息标签 |
| `toolPendingBg` | 工具框（进行中） |
| `toolSuccessBg` | 工具框（成功） |
| `toolErrorBg` | 工具框（错误） |
| `toolTitle` | 工具标题 |
| `toolOutput` | 工具输出文本 |

### Markdown（10 种颜色） {#markdown-10-colors}

| Token | 用途 |
|-------|---------|
| `mdHeading` | 标题 |
| `mdLink` | 链接文本 |
| `mdLinkUrl` | 链接 URL |
| `mdCode` | 行内代码 |
| `mdCodeBlock` | 代码块内容 |
| `mdCodeBlockBorder` | 代码块围栏 |
| `mdQuote` | 引用文本 |
| `mdQuoteBorder` | 引用边框 |
| `mdHr` | 水平分隔线 |
| `mdListBullet` | 列表项目符号 |

### 工具 Diff（3 种颜色） {#tool-diffs-3-colors}

| Token | 用途 |
|-------|---------|
| `toolDiffAdded` | 新增行 |
| `toolDiffRemoved` | 删除行 |
| `toolDiffContext` | 上下文行 |

### 语法高亮（9 种颜色） {#syntax-highlighting-9-colors}

| Token | 用途 |
|-------|---------|
| `syntaxComment` | 注释 |
| `syntaxKeyword` | 关键字 |
| `syntaxFunction` | 函数名 |
| `syntaxVariable` | 变量 |
| `syntaxString` | 字符串 |
| `syntaxNumber` | 数字 |
| `syntaxType` | 类型 |
| `syntaxOperator` | 运算符 |
| `syntaxPunctuation` | 标点 |

### Thinking 级别边框（6 个必需，1 个可选） {#thinking-level-borders-6-required-1-optional}

表示 thinking 级别的编辑器边框颜色（从弱到强的视觉层级）：

| Token | 用途 |
|-------|---------|
| `thinkingOff` | Thinking 关闭 |
| `thinkingMinimal` | 最低 thinking |
| `thinkingLow` | 低 thinking |
| `thinkingMedium` | 中 thinking |
| `thinkingHigh` | 高 thinking |
| `thinkingXhigh` | 额外高 thinking |
| `thinkingMax` | 最高 thinking；可选，回退到 `thinkingXhigh` |

### Bash 模式（1 种颜色） {#bash-mode-1-color}

| Token | 用途 |
|-------|---------|
| `bashMode` | bash 模式下的编辑器边框（`!` 前缀） |

### HTML 导出（可选） {#html-export-optional}

`export` 部分控制 `/export` HTML 输出的颜色。若省略，颜色会从 `userMessageBg` 派生。

```json
{
  "export": {
    "pageBg": "#18181e",
    "cardBg": "#1e1e24",
    "infoBg": "#3c3728"
  }
}
```

## 颜色值 {#color-values}

支持四种格式：

| 格式 | 示例 | 说明 |
|--------|---------|-------------|
| Hex | `"#ff0000"` | 6 位十六进制 RGB |
| 256-color | `39` | xterm 256 色调色板索引（0–255） |
| Variable | `"primary"` | 对 `vars` 条目的引用 |
| Default | `""` | 终端的默认颜色 |

### 256 色调色板 {#256-color-palette}

- `0-15`：基本 ANSI 颜色（取决于终端）
- `16-231`：6×6×6 RGB 立方体（`16 + 36×R + 6×G + B`，其中 R、G、B 为 0–5）
- `232-255`：灰度渐变

### 终端兼容性 {#terminal-compatibility}

Pi 使用 24-bit RGB 颜色。大多数现代终端都支持（iTerm2、Kitty、WezTerm、Windows Terminal、VS Code）。对于仅支持 256 色的旧终端，pi 会回退到最接近的近似色。

检查 truecolor 支持：

```bash
echo $COLORTERM  # 应输出 "truecolor" 或 "24bit"
```

## 提示 {#tips}

**深色终端：** 使用明亮、饱和、对比度更高的颜色。

**浅色终端：** 使用更深、更柔和、对比度更低的颜色。

**色彩和谐：** 从一个基础调色板（Nord、Gruvbox、Tokyo Night）开始，在 `vars` 中定义，并保持一致引用。

**测试：** 用不同的消息类型、工具状态、markdown 内容以及长换行文本检查你的主题。

**VS Code：** 将 `terminal.integrated.minimumContrastRatio` 设为 `1` 以获得准确颜色。

## 示例 {#examples}

参见内置主题：
- [dark.json](../src/modes/interactive/theme/dark.json)
- [light.json](../src/modes/interactive/theme/light.json)
