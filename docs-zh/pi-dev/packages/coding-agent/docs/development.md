本文是 `development.md` 的中文阅读版；命令、路径、API 名称保持英文。

# 开发 {#development}

更多指南见 [AGENTS.md](https://github.com/earendil-works/pi-mono/blob/main/AGENTS.md)。

## 环境搭建 {#setup}

```bash
git clone https://github.com/earendil-works/pi-mono
cd pi-mono
npm install
npm run build
```

从源码运行：

```bash
/path/to/pi-mono/pi-test.sh
```

该脚本可从任意目录运行。Pi 会保持调用方的当前工作目录。

## Fork / 重新品牌化 {#forking--rebranding}

通过 `package.json` 配置：

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

修改 fork 中的 `name`、`configDir` 和 `bin` 字段。这会影响 CLI 横幅、配置路径以及环境变量名。

## 路径解析 {#path-resolution}

三种执行模式：npm 安装、独立二进制、从源码用 tsx 运行。

包资源**始终使用 `src/config.ts`**：

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

切勿直接使用 `__dirname` 定位包资源。

## 调试命令 {#debug-command}

`/debug`（隐藏命令）写入 `~/.pi/agent/pi-debug.log`：
- 带 ANSI 码的已渲染 TUI 行
- 最近发送给 LLM 的消息

## 测试 {#testing}

```bash
./test.sh                         # 运行非 LLM 测试（无需 API 密钥）
npm test                          # 运行全部测试
npm test -- test/specific.test.ts # 运行指定测试
```

## 项目结构 {#project-structure}

```
packages/
  ai/           # LLM 提供商抽象
  agent/        # Agent 循环与消息类型
  tui/          # 终端 UI 组件
  coding-agent/ # CLI 与交互模式
```
