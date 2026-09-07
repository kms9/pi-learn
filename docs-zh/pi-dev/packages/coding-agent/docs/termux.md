本文是 `termux.md` 的中文阅读版；命令、路径、API 名称保持英文。

# Termux（Android）设置 {#termux-android-setup}

Pi 可通过 [Termux](https://termux.dev/) 在 Android 上运行。Termux 是面向 Android 的终端模拟器和 Linux 环境。

## 前置条件 {#prerequisites}

1. 从 GitHub 或 F-Droid 安装 [Termux](https://github.com/termux/termux-app#installation)（不要从 Google Play 安装，该版本已弃用）
2. 从 GitHub 或 F-Droid 安装 [Termux:API](https://github.com/termux/termux-api#installation)，以支持剪贴板及其他设备集成

## 安装 {#installation}

```bash
# 更新软件包
pkg update && pkg upgrade

# 安装依赖
pkg install nodejs termux-api git

# 安装 pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 创建配置目录
mkdir -p ~/.pi/agent

# 运行 pi
pi
```

## 剪贴板支持 {#clipboard-support}

在 Termux 中运行时，剪贴板操作使用 `termux-clipboard-set` 和 `termux-clipboard-get`。这些命令需要安装 Termux:API 应用才能工作。

Termux 不支持图片剪贴板（`ctrl+v` 图片粘贴功能不可用）。

## Termux 的 AGENTS.md 示例 {#example-agentsmd-for-termux}

创建 `~/.pi/agent/AGENTS.md`，帮助 agent 理解 Termux 环境：

````markdown
# Agent 环境：Android 上的 Termux

## 位置
- **OS**：Android（Termux 终端模拟器）
- **Home**：`/data/data/com.termux/files/home`
- **Prefix**：`/data/data/com.termux/files/usr`
- **共享存储**：`/storage/emulated/0`（Downloads、Documents 等）

## 打开 URL
```bash
termux-open-url "https://example.com"
```

## 打开文件
```bash
termux-open file.pdf          # 用默认应用打开
termux-open --chooser image.jpg      # 选择应用
```

## 剪贴板
```bash
termux-clipboard-set "text"   # 复制
termux-clipboard-get          # 粘贴
```

## 通知
```bash
termux-notification -t "Title" -c "Content"
```

## 设备信息
```bash
termux-battery-status         # 电池信息
termux-wifi-connectioninfo    # WiFi 信息
termux-telephony-deviceinfo   # 设备信息
```

## 分享
```bash
termux-share -a send file.txt # 分享文件
```

## 其他常用命令
```bash
termux-toast "message"        # 快速 toast 弹窗
termux-vibrate                # 振动设备
termux-tts-speak "hello"      # 语音朗读
termux-camera-photo out.jpg   # 拍照
```

## 注意事项
- `termux-*` 命令需要安装 Termux:API 应用
- 命令行工具使用 `pkg install termux-api`
- 访问 `/storage/emulated/0` 需要存储权限
````

## 限制 {#limitations}

- **无图片剪贴板**：Termux 剪贴板 API 仅支持文本
- **无原生二进制**：部分可选的原生依赖（如剪贴板模块）在 Android ARM64 上不可用，安装时会跳过
- **存储访问**：要访问 `/storage/emulated/0`（Downloads 等）中的文件，请运行一次 `termux-setup-storage` 以授予权限

## 故障排除 {#troubleshooting}

### 剪贴板不工作 {#clipboard-not-working}

确保两个应用都已安装：
1. Termux（来自 GitHub 或 F-Droid）
2. Termux:API（来自 GitHub 或 F-Droid）

然后安装 CLI 工具：
```bash
pkg install termux-api
```

### 共享存储权限被拒绝 {#permission-denied-for-shared-storage}

运行一次以授予存储权限：
```bash
termux-setup-storage
```

### Node.js 安装问题 {#nodejs-installation-issues}

如果 npm 失败，尝试清除缓存：
```bash
npm cache clean --force
```
