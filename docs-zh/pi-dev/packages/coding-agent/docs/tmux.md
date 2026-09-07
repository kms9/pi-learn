本文是 `tmux.md` 的中文阅读版；命令、路径、API 名称保持英文。

# tmux 设置 {#tmux-setup}

Pi 可以在 tmux 中运行，但 tmux 默认会剥掉某些按键的修饰信息。不加配置时，`Shift+Enter` 和 `Ctrl+Enter` 通常与普通 `Enter` 无法区分。

## 推荐配置 {#recommended-configuration}

添加到 `~/.tmux.conf`：

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

然后彻底重启 tmux：

```bash
tmux kill-server
tmux
```

当 Kitty keyboard protocol 不可用时，Pi 会自动请求扩展按键报告。设置 `extended-keys-format csi-u` 后，tmux 会以 CSI-u 格式转发带修饰键的按键，这是最可靠的配置。`extended-keys-format` 选项需要 tmux 3.5 或更高版本。

## 为何推荐 `csi-u` {#why-csi-u-is-recommended}

若仅有：

```tmux
set -g extended-keys on
```

tmux 默认使用 `extended-keys-format xterm`。当应用请求扩展按键报告时，带修饰键的按键会以 xterm `modifyOtherKeys` 格式转发，例如：

- `Ctrl+C` → `\x1b[27;5;99~`
- `Ctrl+D` → `\x1b[27;5;100~`
- `Ctrl+Enter` → `\x1b[27;5;13~`

使用 `extended-keys-format csi-u` 时，同样的按键会转发为：

- `Ctrl+C` → `\x1b[99;5u`
- `Ctrl+D` → `\x1b[100;5u`
- `Ctrl+Enter` → `\x1b[13;5u`

Pi 两种格式都支持，但 `csi-u` 是推荐的 tmux 配置。

## 这能修复什么 {#what-this-fixes}

没有 tmux 扩展按键时，带修饰键的 Enter 会折叠为旧式序列：

| 按键 | 未启用 extkeys | 使用 `csi-u` |
|-----|-----------------|--------------|
| Enter | `\r` | `\r` |
| Shift+Enter | `\r` | `\x1b[13;2u` |
| Ctrl+Enter | `\r` | `\x1b[13;5u` |
| Alt/Option+Enter | `\x1b\r` | `\x1b[13;3u` |

这会影响默认快捷键（`Enter` 提交、`Shift+Enter` 换行）以及任何使用带修饰 Enter 的自定义快捷键。

## 要求 {#requirements}

- `extended-keys-format csi-u` 需要 tmux 3.5 或更高版本（运行 `tmux -V` 检查）
- 支持扩展按键的终端模拟器（Ghostty、Kitty、iTerm2、WezTerm、Windows Terminal）

tmux 3.2 到 3.4 请省略 `extended-keys-format csi-u`；Pi 仍支持 tmux 默认的 xterm `modifyOtherKeys` 格式。
