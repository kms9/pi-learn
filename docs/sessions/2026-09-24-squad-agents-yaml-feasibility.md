---
title: 2026-09-24 Squad 本地角色 YAML 发现可行性
type: session
status: draft
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 Squad 本地角色 YAML 发现可行性

> 后续更新：用户已选择 Markdown + YAML frontmatter，纯 YAML 示例被取代。当前格式与范围见 [[decisions/2026-09-24-squad-role-frontmatter]]；下文保留前序评估记录。

## 用户要做什么

读取 Herdr `w7:p1` 的 Claude 最后一次调研回答，评估 Pi Squad 改为启动时扫描当前 cwd 下 `.agents`，通过注入的 role id 选择 YAML 角色配置。只评估，不实施。

## 达成了什么

结论：可行，建议作为配置入口重构推进。现有 `loadSquadSetup()` 已在 Extension 工厂执行一次，`before_agent_start` 按回合追加缓存的 `role_prompt`。无需为此重写 Controller、心跳或加入自动 spawn。扫描一次指每次 Extension 初始化；重启或重新加载扩展会重新初始化，不能承诺进程存续期绝对只读一次。

### CC 最后回答及核对

2026-09-24 通过 Herdr 只读获取 `w7:p1`（claude、idle、cwd 为本仓库）的最后完整回答；终端显示完成时间 10:38 AM。未给 CC 发新任务。

- CC 调研认为 Multica 使用服务端记录，pi-subagents 使用 Markdown + YAML frontmatter；主要可借鉴点是身份、人格、运行时分离。
- 配置目录不是在线名单；提示中的“不要修改文件”不等于工具权限限制；同一个 role 可以有多个 agent_id。
- 补充：当前 `pi-subagents/docs/agents.md` 还记录了 legacy `.agents/**/*.md` 发现，CC 的路径摘要未提及。
- 补充：虽没有 Extension config 单元测试，已有 `pi_squad_case/phase_00_identity/verify-config-pi.mjs` 检查真实 Pi 的配置、注册和注入；不能把当前测试概括成只有 Controller smoke。
- Multica 细节只作为 CC 调研摘要转述，本轮未独立重做其外部源码核验。

### 上游可借鉴的是什么

Claude Code 用 `.claude/agents/*.md` 的 YAML frontmatter 和 Markdown 正文定义角色，Agent Teams 可复用这些定义。Teams 的运行态配置仍是自动生成的 JSON，不能作为手写角色库。OpenClaw 用 JSON5 配置和按 agent 隔离的 workspace/persona 文件。故 cwd `.agents` + 纯 YAML 是本项目方案，不是两者通用格式。详见 [[sources/agent-role-config-references]]。

### 建议流程（未实现）

1. 固定启动 cwd，只发现 `<cwd>/.agents/roles/*.yaml` 与 `*.yml`，不递归整仓、不向父目录或 home 搜索。专用子目录避开 `.agents/skills` 等内容。
2. 注入新选择器 `PI_SQUAD_ROLE_ID=reviewer`；解析角色文件并按 `id` 精确选择唯一一份。目录扫描不是向模型注入整个角色库。
3. 校验后构建现有 `SquadSetup`：角色提示与 Registry 字段继续分开；Herdr 位置、Controller 地址、心跳间隔仍由环境优先确定。
4. `session_start` 注册选中实例；每个 `before_agent_start` 追加已缓存提示；`/new` 不重新选角色，不在每个 turn 扫盘。
5. `/squad-whoami` 增加选择器、加载根目录和文件路径，便于确认当前身份。`list_agents` 继续查询 Controller。

建议首版用纯 YAML，保留当前字段拼写，减少迁移量。例如 `.agents/roles/reviewer.yaml`（设计草案，不是当前用法）：

```yaml
id: reviewer
agent_id: pi-case-reviewer
role: reviewer
squad_id: pi-case
role_prompt: |
  你负责代码审查。
  报告问题的位置、影响和验证方法。
```

插件已安装时，目标启动体验是 `PI_SQUAD_ROLE_ID=reviewer pi`。`id` 是角色配置的选择键；`agent_id` 是该配置默认注册的逻辑身份；`role` 是 Registry 路由标签。允许 `PI_SQUAD_AGENT_ID`、`PI_SQUAD_ID` 覆盖实例身份和所属小队，角色提示仍取选中 YAML。首版将实例默认值写在同一文件是便利，不代表角色与身份同义；将来复用需求变复杂再拆项目 defaults，不必现在加 squad roster。

同角色多个实例必须传不同 `agent_id`，不能都默认同一个 id。当前 P0 同 id 注册会更新原记录，不能把“换成 YAML”描述成已解决身份占用协议。跨项目共用 Controller 时也应避免默认 agent_id 冲突。

### 格式与失败规则

- 若用户所说 YAML 实际指 CC 展示的 frontmatter，则改为 `.agents/roles/*.md`、YAML 头存元数据、正文映射 role_prompt。首版只选一种格式，避免维护两套解析优先级；当前建议遵照“YAML 文件”字面采用纯 YAML。
- 采用成熟 YAML 解析库并显式声明依赖，不依赖 Pi 间接依赖或自行用正则解析。当前 pi_squad 无 package.json，需一并明确本地依赖安装/打包路径。
- 检查重复 id、重复 YAML 键、根节点类型、非字符串 id、文件大小（可沿用 64 KiB），未知字段给明确错误。未知 role、选中配置缺失/损坏时跳过 Squad 注册和角色注入，不静默回退其它身份。
- 全局安装插件但未提供选择器时，建议安静不启用 Squad 身份；本条为行为提案，现实现会告警。
- 不自动 watcher；修改角色后重启生效。若支持 `/reload`，须测试旧心跳清理和重新注册，不把身份热切换当作附带功能。
- 第一阶段不接收尚未落实的 tools/model/skills 等字段。它们需要真实运行时 API、冲突处理与验收，不能仅写入 prompt 伪装生效。
- 删除 JSON 角色配置读取路径时，旧 `PI_SQUAD_CONFIG` 应给明确迁移提示，不默默忽略。HTTP 请求、Pi RPC 和 SQLite 数据不因配置改 YAML 而改格式。

### 改动范围与验收

| 范围 | 预计改动 |
|---|---|
| `pi_squad/extension/config.ts` | cwd 发现、YAML 解析、唯一选择、校验和覆盖规则 |
| `pi_squad/extension/index.ts` | 接入选择结果，扩展 whoami；保留按回合注入机制 |
| `pi_squad/extension/registration.ts` | 视身份环境覆盖复用情况调整，HTTP payload 无需变化 |
| 依赖与示例 | 明确 YAML 库依赖，新增 YAML 示例；不擅自删除本机未跟踪 configs |
| `pi_squad/USAGE.md` 与 Extension README | 功能落地时同步更新安装、配置和启动用法 |
| `pi_squad_case/phase_00_identity/verify-config-pi.mjs` | 改为临时 cwd + YAML 角色，验证选择、注入、裸 Pi 行为 |

必要验收：两角色隔离；同角色不同 agent_id；找不到/重复/畸形 YAML；cwd 边界；环境覆盖；文件中 persona 不泄漏到 Registry；未选择不注册；每轮只追加一次；`/new` 不换角色；重启/扩展 reload 行为；旧 JSON 迁移提示。Controller smoke 保留作为协议回归。

工作量判断：只做发现与 YAML 迁移是边界清楚的小到中等改造；增加模型、工具限制、技能、动态组队会明显扩大范围。本轮未执行测试或修改插件。

## 写回了哪些 wiki 页

- 本页、[[sources/agent-role-config-references]]、[[sources/source-register]]、[[concepts/pi-squad]]、[[questions/open-questions]]、主索引与日志。

## 未决

- 已解决：用户选择 Markdown + YAML frontmatter，见后续决策。
- 是否接受 YAML 内默认身份 + 环境覆盖，以及首版直接移除 JSON 读取？

## 相关页面

- 概念：[[concepts/pi-squad]]
- 学习：[[learning/Paseo-Pi-Agent-Teams-Herdr多Harness协同架构]]
- 本地证据：`pi_squad/extension/config.ts`、`index.ts`、`registration.ts`；`pi_squad_case/phase_00_identity/verify-config-pi.mjs`；`pi-subagents/docs/agents.md`。
