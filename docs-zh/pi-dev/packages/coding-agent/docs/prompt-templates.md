本文是 `prompt-templates.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以创建提示词模板。让它按你的工作流构建一个即可。

# 提示词模板 {#prompt-templates}

提示词模板是会展开为完整提示词的 Markdown 片段。在编辑器中输入 `/name` 即可调用模板，其中 `name` 是去掉 `.md` 的文件名。

## 位置 {#locations}

Pi 从以下位置加载提示词模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`（仅在项目被信任之后）
- 包：`prompts/` 目录或 `package.json` 中的 `pi.prompts` 条目
- 设置：`prompts` 数组，包含文件或目录
- CLI：`--prompt-template <path>`（可重复）

使用 `--no-prompt-templates` 禁用发现。

## 格式 {#format}

```markdown
---
description: 审查已暂存的 git 变更
---
审查已暂存的变更（`git diff --cached`）。重点关注：
- Bug 与逻辑错误
- 安全问题
- 错误处理缺口
```

- 文件名成为命令名。`review.md` 变成 `/review`。
- `description` 可选。若缺失，则使用第一个非空行。
- `argument-hint` 可选。设置后，提示会显示在自动补全下拉列表中描述之前。

### 参数提示 {#argument-hints}

在 frontmatter 中使用 `argument-hint`，在自动补全中显示预期参数。用 `<angle brackets>` 表示必需参数，用 `[square brackets]` 表示可选参数：

```markdown
---
description: 从 URL 审查 PR，进行结构化的 issue 与代码分析
argument-hint: "<PR-URL>"
---
```

这会在自动补全下拉列表中渲染为：

```
→ pr   <PR-URL>       — 从 URL 审查 PR，进行结构化的 issue 与代码分析
  is   <issue>        — 分析 GitHub issue（bug 或功能请求）
  wr   [instructions] — 端到端完成当前任务
  cl   — 发布前审计 changelog 条目
```

## 用法 {#usage}

在编辑器中输入 `/` 后跟模板名称。自动补全会显示可用模板及其描述。

```
/review                           # 展开 review.md
/component Button                 # 展开并带上参数
/component Button "click handler" # 多个参数
```

## 参数 {#arguments}

模板支持位置参数、默认值和简单切片：

- `$1`、`$2`、... 位置参数
- `$@` 或 `$ARGUMENTS` 表示拼接后的全部参数
- `${1:-default}` 在参数 1 存在且非空时使用它，否则使用 `default`
- `${@:-default}` 或 `${ARGUMENTS:-default}` 在全部参数存在且非空时使用它们，否则使用 `default`
- `${@:N}` 表示从第 N 个位置开始的参数（1-indexed）
- `${@:N:L}` 表示从 N 开始的 `L` 个参数

示例：

```markdown
---
description: 创建一个组件
---
创建一个名为 $1 的 React 组件，功能：$@
```

默认值对可选参数很有用：

```markdown
用 ${1:-7} 个要点总结当前状态。
```

用法：`/component Button "onClick handler" "disabled support"`

## 加载规则 {#loading-rules}

- `prompts/` 中的模板发现是非递归的。
- 若希望子目录中的模板也被加载，请通过 `prompts` 设置或包清单显式添加。
