本文是 `terminal-setup.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 终端设置 {#terminal-setup}

Pi 使用 [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) 来可靠地检测修饰键。多数现代终端支持该协议，但有些需要配置。

## 能力覆盖 {#capability-overrides}

Pi 会自动检测 OSC 8 超链接、行内图片协议和真彩色。如果在终端代理或多路复用器之后检测失败，可使用以下高级覆盖：

| 能力 | 环境变量 | JSON 设置 |
|------------|----------------------|--------------|
| OSC 8 超链接 | `PI_HYPERLINKS=1\|0\|auto` | `terminal.hyperlinks: true\|false\|"auto"` |
| 行内图片 | `PI_IMAGE_PROTOCOL=kitty\|iterm2\|none\|auto` | `terminal.images: "kitty"\|"iterm2"\|false\|"auto"` |
| 真彩色 | `PI_TRUE_COLOR=1\|0\|auto` | `terminal.trueColor: true\|false\|"auto"` |

设置优先于环境变量；未设置或 `auto` 则保留自动检测。仅强制启用来自完整终端路径所支持的能力，因为不支持的转义序列可能破坏渲染。

## Kitty {#kitty}

开箱即用。

## iTerm2 {#iterm2}

### 普通 TUI 模式 {#regular-tui-mode}

开箱即用。

### 全屏 TUI 模式 {#fullscreen-tui-mode}

Pi 接管视口，因此 iTerm2 会发送鼠标滚轮报告，而不是滚动其原生回滚缓冲区。在 iTerm2 默认的触控板快速滚动行为下，这些报告可能会丢失加速滚轮增量的大部分，导致全屏滚动比普通滚动慢得多。

如果在全屏模式下快速滚轮手势每次只滚动大约一行：

1. 打开 **iTerm2 → Settings → Advanced**。
2. 搜索 **Trackpad scrolls fast?** 并将其设为 **No**。

这是 iTerm2 全局的变通办法，也可能改变原生触控板滚动。底层行为见 [iTerm2 issue 9619](https://gitlab.com/gnachman/iterm2/-/work_items/9619)。

## Apple Terminal {#apple-terminal}

在可用时，Pi 会启用增强按键报告。如果 Terminal.app 仍将 `Shift+Enter` 发送为普通 Return，pi 会使用本地 macOS 修饰键回退，将该 Return 视为 `Shift+Enter`。

该回退仅在 pi 与 Terminal.app 运行在同一台 Mac 上时有效。通过远程 SSH 时无法检测本地键盘。

## Ghostty {#ghostty}

添加到 Ghostty 配置（macOS 上为 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 上为 `~/.config/ghostty/config`）：

```
keybind = alt+backspace=text:\x1b\x7f
```

较旧的 Claude Code 版本可能添加了如下 Ghostty 映射：

```
keybind = shift+enter=text:\n
```

该映射会发送原始换行字节。在 pi 内部，它与 `Ctrl+J` 无法区分，因此 tmux 和 pi 都不再能看到真正的 `shift+enter` 按键事件。

如果你添加该映射只是为了 Claude Code 2.x 或更新版本，可以将其删除；除非你要在 tmux 中使用 Claude Code，那种情况下仍需要该 Ghostty 映射。

Pi 将 `Ctrl+J` 绑定为默认的换行别名，因此在 tmux 中可通过该重映射继续使用 `Shift+Enter`，无需额外配置 pi。

### 全屏 TUI 模式 {#fullscreen-tui-mode-1}

全屏模式下链接仍可点击，但在 pi 捕获鼠标输入期间，Ghostty 不会显示悬停下划线或左下角 URL 预览。在 macOS 上按住 `Shift+Command`，在 Linux 上按住 `Shift+Ctrl`，即可使用 Ghostty 的原生链接处理。

## WezTerm {#wezterm}

WezTerm 通常开箱即用，通过 xterm modifyOtherKeys 支持 `Shift+Enter`。若要显式使用 Kitty keyboard protocol，创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

在 macOS 上，WezTerm 默认将 `Option+Enter` 绑定为全屏。若要用 `Option+Enter` 为 pi 排队后续消息，添加如下按键覆盖：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.keys = {
  {
    key = 'Enter',
    mods = 'ALT',
    action = wezterm.action.SendString('\x1b[13;3u'),
  },
}
return config
```

如果已有 `config.keys` 表，把该项加入其中即可。

在 WSL 上，WezTerm 可能需要可见的硬件光标来定位输入法候选窗口。如果中日韩输入法候选框不跟随文本光标，请在运行 pi 前设置 `PI_HARDWARE_CURSOR=1`，或在设置中将 `showHardwareCursor` 设为 `true`。

## Alacritty {#alacritty}

Alacritty 通常开箱即用支持 `Shift+Enter`。在 macOS 上，`Option+Enter` 可能作为普通 `Enter` 到达。若要用 `Option+Enter` 为 pi 排队后续消息，添加到 `~/.config/alacritty/alacritty.toml`：

```toml
[[keyboard.bindings]]
key = "Enter"
mods = "Alt"
chars = "\u001b[13;3u"
```

更改配置后请重启 Alacritty。

## VS Code（集成终端） {#vs-code-integrated-terminal}

VS Code 1.109.5 及更新版本默认在集成终端中启用 Kitty keyboard protocol，因此 `Shift+Enter` 应可开箱即用。

低于 1.109.5 的 VS Code 版本需要为 `Shift+Enter` 显式添加终端快捷键。

`keybindings.json` 位置：
- macOS: `~/Library/Application Support/Code/User/keybindings.json`
- Linux: `~/.config/Code/User/keybindings.json`
- Windows: `%APPDATA%\\Code\\User\\keybindings.json`

添加到 `keybindings.json`：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

## Zed（集成终端） {#zed-integrated-terminal}

将这些按键绑定添加到 Zed 的 `keymap.json`：

```json
{
  "context": "Terminal",
  "bindings": {
    "shift-enter": ["terminal::SendText", "\u001b[13;2u"],
    "ctrl--": ["terminal::SendText", "\u001b[45;5u"],
    "ctrl-alt-]": ["terminal::SendText", "\u001b[93;7u"]
  }
}
```

## Windows Terminal {#windows-terminal}

在 Windows 原生或 WSL 中运行时，Pi 使用 Windows 风格的快捷键：

- `Alt+V` 粘贴图片或剪贴板文本。
- `Ctrl+F` 在全屏模式下搜索会话记录，`Ctrl+Up`/`Ctrl+Down` 在已标记的消息之间跳转。
- `Alt+P` 循环切换到上一个模型。
- `Ctrl+Z` 在原生 Windows 上撤销编辑；WSL 使用 `Alt+Z`，以便 `Ctrl+Z` 可以挂起 pi。
- `Ctrl+Q` 排队后续消息，`Alt+Q` 恢复已排队的消息。

在 `settings.json` 中添加以下内容（Ctrl+Shift+, 或 Settings → Open JSON file），以转发 `Shift+Enter` 用于插入新行：

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "\u001b[13;2u" },
      "keys": "shift+enter"
    }
  ]
}
```

Windows Terminal 默认将 `Alt+Enter` 绑定为全屏。若要用它代替 pi 默认的 `Ctrl+Q` 来排队后续消息，请配置 Windows Terminal 发送该按键，并在 pi 中将 `app.message.followUp` 绑定为 `alt+enter`。

如果已有 `actions` 数组，把该对象加入其中。修改设置后请完全关闭并重新打开 Windows Terminal。

## xfce4-terminal、terminator {#xfce4-terminal-terminator}

这些终端对转义序列的支持有限。带修饰键的 Enter（如 `Ctrl+Enter` 和 `Shift+Enter`）无法与普通 `Enter` 区分，因此类似 `submit: ["ctrl+enter"]` 的自定义快捷键无法生效。

为获得最佳体验，请使用支持 Kitty keyboard protocol 的终端：
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty)（需要以 Kitty protocol 支持编译）

## IntelliJ IDEA（集成终端） {#intellij-idea-integrated-terminal}

内置终端对转义序列的支持有限。在 IntelliJ 终端中，Shift+Enter 无法与 Enter 区分。

如果希望显示硬件光标，请在运行 pi 前设置 `PI_HARDWARE_CURSOR=1`（为兼容性默认关闭）。

建议使用独立的终端模拟器以获得最佳体验。
