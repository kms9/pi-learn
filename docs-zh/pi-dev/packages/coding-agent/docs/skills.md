本文是 `skills.md` 的中文阅读版；命令、路径、API 名称保持英文。

> pi 可以创建 skill。让它按你的场景构建一个即可。

# 技能 {#skills}

技能是自包含的能力包，由 agent 按需加载。一个 skill 为特定任务提供专用工作流、设置说明、辅助脚本和参考文档。

Pi 实现了 [Agent Skills 标准](https://agentskills.io/specification)，对大多数违规会发出警告，但保持宽松。Pi 允许 skill 名称与其父目录不同，尽管标准禁止这样做；该规则对跨多个 agent harness 共用的 skill 目录并不理想。

## 目录 {#table-of-contents}

- [位置](#locations)
- [技能如何工作](#how-skills-work)
- [技能命令](#skill-commands)
- [技能结构](#skill-structure)
- [Frontmatter](#frontmatter)
- [校验](#validation)
- [示例](#example)
- [技能仓库](#skill-repositories)

## 位置 {#locations}

> **安全：** 技能可以指示模型执行任意操作，并可能包含模型会调用的可执行代码。使用前请审查技能内容。

Pi 从以下位置加载技能：

- 全局：
  - `~/.pi/agent/skills/`
  - `~/.agents/skills/`
- 项目（仅在项目被信任之后）：
  - `.pi/skills/`
  - `cwd` 及其祖先目录中的 `.agents/skills/`（直到 git 仓库根目录；若不在仓库中则直到文件系统根）
- 包：`skills/` 目录或 `package.json` 中的 `pi.skills` 条目
- 设置：`skills` 数组，包含文件或目录
- CLI：`--skill <path>`（可重复；即使使用 `--no-skills` 也会追加加载）

发现规则：
- 在 `~/.pi/agent/skills/` 和 `.pi/skills/` 中，当根目录下的直接 `.md` 文件具有有效的 skill frontmatter 且 `description` 非空时，会作为独立技能被发现
- 在所有技能位置中，包含 `SKILL.md` 的目录会被递归发现
- 在 `~/.agents/skills/` 和项目 `.agents/skills/` 中，根目录 `.md` 文件会被忽略，但分组文件夹中声明了 skill frontmatter 的嵌套 `.md` 文件会被发现
- 根目录下除 `SKILL.md` 以外、看起来不像技能的 Markdown 文件会被静默忽略

使用 `--no-skills` 禁用发现（显式的 `--skill` 路径仍会加载）。

### 使用来自其他 harness 的技能 {#using-skills-from-other-harnesses}

要从 Claude Code 或 OpenAI Codex 使用技能，将其目录加入设置：

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

对于项目级 Claude Code 技能，添加到 `.pi/settings.json`：

```json
{
  "skills": ["../.claude/skills"]
}
```

## 技能如何工作 {#how-skills-work}

1. 启动时，pi 扫描技能位置并提取名称与描述
2. 系统提示按[规范](https://agentskills.io/integrate-skills)以 XML 格式包含可用技能
3. 当任务匹配时，agent 使用 `read`（若 `read` 不可用则使用 `bash`）加载完整的 SKILL.md（模型并不总会这样做；可用提示词或 `/skill:name` 强制加载）
4. agent 遵循说明，用相对路径引用脚本和资源

这是渐进披露：描述始终在上下文中，完整说明按需加载。

## 技能命令 {#skill-commands}

技能注册为 `/skill:name` 命令：

```bash
/skill:brave-search           # 加载并执行该技能
/skill:pdf-tools extract      # 加载技能并附带参数
```

命令后的参数会作为 `User: <args>` 追加到技能内容。

通过交互模式中的 `/settings` 或在 `settings.json` 中切换技能命令：

```json
{
  "enableSkillCommands": true
}
```

## 技能结构 {#skill-structure}

技能是包含 `SKILL.md` 文件的目录。其余内容可自由组织。

```
my-skill/
├── SKILL.md              # 必需：frontmatter + 说明
├── scripts/              # 辅助脚本
│   └── process.sh
├── references/           # 按需加载的详细文档
│   └── api-reference.md
└── assets/
    └── template.json
```

### SKILL.md 格式 {#skillmd-format}

````markdown
---
name: my-skill
description: 该技能做什么、何时使用。请尽量具体。
---

# 我的技能

## 设置

首次使用前运行一次：
```bash
cd /path/to/skill && npm install
```

## 用法

```bash
./scripts/process.sh <input>
```
````

使用相对于技能目录的路径：

```markdown
详见[参考指南](references/REFERENCE.md)。
```

## Frontmatter {#frontmatter}

按 [Agent Skills 规范](https://agentskills.io/specification#frontmatter-required)：

| 字段 | 必需 | 说明 |
|-------|----------|-------------|
| `name` | 是 | 最多 64 个字符。小写 a-z、0-9、连字符。与标准不同，Pi 不要求它与父目录匹配，因为该标准要求对共用技能目录并不理想。 |
| `description` | 是 | 最多 1024 个字符。该技能做什么、何时使用。 |
| `license` | 否 | 许可证名称，或指向捆绑文件的引用。 |
| `compatibility` | 否 | 最多 500 个字符。环境要求。 |
| `metadata` | 否 | 任意键值映射。 |
| `allowed-tools` | 否 | 空格分隔的预批准工具列表（实验性）。 |
| `disable-model-invocation` | 否 | 为 `true` 时，技能从系统提示中隐藏。用户必须使用 `/skill:name`。 |

### 名称规则 {#name-rules}

- 1–64 个字符
- 仅限小写字母、数字、连字符
- 不能有前导/尾随连字符
- 不能有连续连字符
Pi 不要求名称与父目录匹配。Agent Skills 标准要求匹配，但该要求对供多种工具共用的技能目录并不理想。

有效：`pdf-processing`、`data-analysis`、`code-review`
无效：`PDF-Processing`、`-pdf`、`pdf--processing`

### 描述最佳实践 {#description-best-practices}

描述决定 agent 何时加载该技能。请尽量具体。

好的示例：
```yaml
description: 从 PDF 文件中提取文本和表格，填写 PDF 表单，并合并多个 PDF。在处理 PDF 文档时使用。
```

差的示例：
```yaml
description: 帮助处理 PDF。
```

## 校验 {#validation}

Pi 对照 Agent Skills 标准校验技能。大多数问题会发出警告，但仍会加载技能：

- 名称超过 64 个字符或包含无效字符
- 名称以连字符开头/结尾，或包含连续连字符
- 描述超过 1024 个字符

未知的 frontmatter 字段会被忽略。

已声明但缺少描述的技能不会被加载。格式错误的 `SKILL.md` 以及没有描述的 `SKILL.md` 会产生警告且不会被加载。其他没有有效 skill frontmatter 的 Markdown 文件会被忽略。

名称冲突（不同位置出现相同名称）会发出警告并保留最先找到的技能。

## 示例 {#example}

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md：**
````markdown
---
name: brave-search
description: 通过 Brave Search API 进行网页搜索与内容提取。用于搜索文档、事实或任何网页内容。
---

# Brave Search

## 设置

```bash
cd /path/to/brave-search && npm install
```

## 搜索

```bash
./search.js "query"              # 基础搜索
./search.js "query" --content    # 包含页面内容
```

## 提取页面内容

```bash
./content.js https://example.com
```
````

## 技能仓库 {#skill-repositories}

- [Anthropic Skills](https://github.com/anthropics/skills) - 文档处理（docx、pdf、pptx、xlsx）、Web 开发
- [Pi Skills](https://github.com/badlogic/pi-skills) - 网页搜索、浏览器自动化、Google API、转写
