---
title: Pi Squad Context Assembly 设计
type: process
status: draft
created: 2026-09-25
updated: 2026-09-25
implementation_status: not_implemented
acceptance_status: not_run
baseline_branch: pi_squad_dev
tags: [pi-squad, context-assembly, prompt, team-runtime]
---

# Pi Squad Context Assembly 设计

本文定义阶段 04 的上下文拼装契约，补充 [Team Runtime 需求](TEAM_RUNTIME_REQUIREMENTS.md) 与 [技术设计](TEAM_RUNTIME_DESIGN.md)。目标是回答一个具体问题：**项目原生 `AGENTS.md`、Pi Squad 的 Team 规则、Role 配置、Role 工作规则、Controller 动态状态和当前 Task，分别在哪里加载，如何进入最终 LLM 请求，以及哪些内容不能靠提示词顺序来解决。**

本文描述拟实施方案，不表示当前代码已经完成。当前可用行为仍以 [USAGE](../../pi_squad/USAGE.md) 为准。

## 1. 决策摘要

1. **保留 Pi 原生 `AGENTS.md` 加载链路。** Pi Squad 不复制、不覆盖、不生成替代项目 `AGENTS.md`。
2. **Role / Team 使用逻辑拼接，不做文件物理拼接。** `.agents/pisquad/roles/**` 与 `.agents/pisquad/teams/**` 保持独立，由 Extension 在 LLM 启动前注入结构化 system sections。
3. **从当前 `return { systemPrompt }` 迁移到 `event.systemPromptOptions.sections`。** 不再把 Pi 已经结构化的 system prompt 压成一个 `forceSystemPrompt` 字符串。
4. **不设计“MD 数值权重”。** Project、Role、Team 各自拥有不同语义域；身份、授权、工具权限、租约和最终完成门由代码强制执行，不能依赖“最后拼接的 Markdown 赢”。
5. **Leader 与普通 Role 获得不同上下文。** Leader 获取当前 Team 的完整协作规则、Roster 和 Run State；普通成员只获取自己的 Role、Role 工作规则和完成当前 Task 所需的 Team 摘要，不注入全部 Team 配置。
6. **静态配置和动态运行事实分开。** `role.md`、`agents.md`、Team instructions 是配置；Roster、在线状态、DAG、Task/Attempt 是运行事实。
7. **Current Task 不永久写入 system 配置。** 正式 Task 以冻结的 TaskContract 进入当前任务输入；动态 Team/Run 状态仅在需要的 Turn 更新。

## 2. 当前源码事实

### 2.1 Pi 原生上下文

Pi 的 `packages/coding-agent/src/core/resource-loader.ts` 会从 cwd 向父目录发现项目上下文文件，并由 `packages/coding-agent/src/core/system-prompt.ts` 组装为结构化 system prompt。

同一目录候选顺序为：

```text
AGENTS.override.md
AGENTS.md
AGENTS.MD
CLAUDE.md
CLAUDE.MD
```

项目文件最终进入：

```xml
<project_context>
  <project_instructions path="/repo/AGENTS.md">
    ...
  </project_instructions>
</project_context>
```

它本质是 **system prompt 的 project_context section**，不是普通 user message。

### 2.2 当前 Pi Squad 注入方式

当前 `pi_squad/extension/index.ts`：

```ts
pi.on("before_agent_start", async (event) => {
  const systemPrompt =
    `${event.systemPrompt}\n\n## Pi Squad role\n${rolePrompt}`;
  return { systemPrompt };
});
```

这能工作，但在当前 Pi 中，`before_agent_start` 返回 `systemPrompt` 会被转成 `forceSystemPrompt`。结果是原本独立的 tools、rules、project_context、skills、cwd 等 section 被渲染后整体压平为一个 opaque system prompt。

这对单一 Role 实验问题不大，但不适合作为 Team Runtime 的长期拼装机制。

### 2.3 Pi 已提供更合适的扩展点

Pi 的 `BeforeAgentStartEvent` 暴露：

```ts
event.systemPromptOptions.sections
```

官方 `prompt-customizer.ts` 示例直接修改该对象。Pi 会保留原生 section，并在模型请求前统一渲染。后续 Turn 还可以对 section 做差量更新。

因此 Pi Squad 应改为 **section 级组合**，而不是重新序列化整个 system prompt。

## 3. Context Domain

不要把所有 Markdown 看成同一种提示词。阶段 04 固定以下语义域：

| Domain | 来源 | 回答的问题 | 所有者 |
|---|---|---|---|
| Project Context | 项目/祖先 `AGENTS.md` | 这个仓库怎样工作？ | Pi 原生 ResourceLoader |
| Squad Protocol | Extension 代码 | 当前 runtime 在 Squad 中必须遵守哪些硬协作规则？ | Pi Squad |
| Role Identity | `roles/<role>/role.md` | 我是谁、职责和稳定边界是什么？ | Pi Squad |
| Role Working Instructions | `roles/<role>/agents.md` | 当前角色的工作约定、检查方法、经验要求是什么？ | Pi Squad |
| Team Context | `teams/<team>/instructions.md` + `team.json` 摘要 | 当前 Team 如何分工、路由、验收？ | Pi Squad / Run snapshot |
| Runtime Roster | Controller | 现在有哪些成员、谁在线、谁忙、谁是 Leader？ | Controller |
| Run State | Controller | DAG、结果、阻塞、review/rework、revision 当前是什么？ | Controller |
| TaskContract | Controller / 用户调用 | 这一轮具体要完成什么、依赖和验收是什么？ | 当前 Task |

核心原则：

```text
Who am I?          -> Role
Who am I with?     -> Team
How does repo work -> AGENTS.md
What is running?   -> Controller state
What should I do?  -> TaskContract
```

不同 Domain 尽量不重复定义同一类规则。

## 4. 文件与生命周期

阶段 04 目录约定继续沿用 Team Runtime 文档：

```text
<project_root>/
├── AGENTS.md
└── .agents/pisquad/
    ├── roles/
    │   └── reviewer/
    │       ├── role.md
    │       └── agents.md
    ├── teams/
    │   └── coding-team/
    │       ├── team.json
    │       ├── instructions.md
    │       └── workflows/
    └── .runtime/
```

生命周期：

| 内容 | 读取时机 | 生效边界 |
|---|---|---|
| 项目 `AGENTS.md` | Pi 原生 ResourceLoader | 遵循 Pi 原生 reload/session 行为 |
| `role.md` | Pi Squad 进程启动 | 进程快照；修改后重启 |
| Role `agents.md` | 正式 Attempt 开始 / 手工 Turn 开始 | Attempt 快照；下一 Attempt 可更新 |
| `team.json` + `instructions.md` | SquadRun 创建 | Run 快照；活动 Run 不热切换 |
| Roster / 在线状态 | Leader Turn 前 | 当前 Turn 动态刷新 |
| Run State | Leader Turn 前 | 当前 Turn 动态刷新 |
| TaskContract | Task Attempt 创建 | Attempt 冻结 |
| Tool / Lease / 权限 | Controller + Extension | 代码强制，不由 Markdown 改写 |

Role 目录中的小写 `agents.md` 是 **Pi Squad 自有文件**，由 Extension 精确读取；它不是 Pi 原生项目 Context 文件，也不依赖 Pi 自动发现。

## 5. 推荐的最终 LLM 上下文

### 5.1 普通 Role / Worker

普通 Role 不需要完整 Team instructions 或整个 DAG。推荐：

```text
SYSTEM
├── Pi Base / Tools / Rules / Docs
├── project_context
│   └── 项目 AGENTS.md
├── skills
├── cwd
├── pi_squad_protocol
├── pi_squad_role
│   └── role.md
├── pi_squad_role_working
│   └── role/agents.md frozen snapshot
└── pi_squad_team_scope
    ├── current team_id
    ├── leader
    ├── member identity / responsibility
    └── coordination constraints required by this task

USER / TASK
└── frozen TaskContract
    ├── squad_run_id
    ├── task_id / attempt_id
    ├── goal
    ├── depends_on / upstream refs
    ├── acceptance criteria
    ├── tool ceiling / write_set summary
    └── required result shape
```

普通成员不默认看到：

- 所有 Team 配置；
- 其它 Team 的配置；
- 全部成员的完整历史；
- 与当前 Task 无关的 DAG 节点；
- 其它 Agent 的会话内容。

### 5.2 Leader

首版 `mode=leader` 按现有 Team Runtime 决策，不再额外加载普通 RoleDefinition：

```text
SYSTEM
├── Pi Base / Tools / Rules / Docs
├── project_context
│   └── 项目 AGENTS.md
├── skills
├── cwd
├── pi_squad_protocol
│   └── Leader hard protocol
├── pi_squad_team
│   └── frozen team instructions / policy summary
├── pi_squad_roster
│   └── current roster + online/activity snapshot
└── pi_squad_run
    └── current DAG summary / new results / blocked items / context_revision

USER / TASK
└── 本次 leader_step 需要处理的事件和目标
```

Leader 的完整 Team instructions 只给当前 Team，不加载其它 Team。

## 6. 为什么不把 Team / Role 写进项目 AGENTS.md

技术上可以把：

```text
Project AGENTS.md
+ Team instructions
+ role.md
+ role/agents.md
```

拼成一个新 `AGENTS.md` 再交给 Pi，但本项目不采用。

原因：

1. **语义污染。** Project、Role、Team、Run 四个维度被写进同一文件后，无法判断哪段由仓库作者、角色作者、Controller 或当前 Run 产生。
2. **动态状态不适合文件化。** Roster、busy/offline、DAG、review 结果会变，不能把它们当项目静态规则。
3. **容易残留。** Task/Team 结束后，生成文件可能被后续普通 Pi 错误读取。
4. **难追踪版本。** Role 的 Attempt snapshot、Team 的 Run snapshot、Project 的 Git 版本具有不同生命周期。
5. **破坏 Pi 的结构化 Prompt。** Pi 已经支持独立 sections，没有必要退回文本拼接。
6. **我们只支持 Pi。** Multica 通过写 runtime-specific context 文件解决多 runtime 兼容问题；Pi Squad 当前不需要为 Codex/Claude/OpenCode 等 Harness 做统一兼容层。

因此这里采用：

> **文件分开，运行时逻辑拼接。**

## 7. Section 设计

建议固定以下 section 名称：

```text
pi_squad_protocol
pi_squad_role
pi_squad_role_working
pi_squad_team
pi_squad_team_scope
pi_squad_roster
pi_squad_run
```

其中：

| Section | Role mode | Leader mode | 静态/动态 |
|---|---:|---:|---|
| `pi_squad_protocol` | 是 | 是 | 进程/版本稳定 |
| `pi_squad_role` | 是 | 否 | 进程稳定 |
| `pi_squad_role_working` | 是 | 否 | Attempt/Turn 快照 |
| `pi_squad_team` | 否 | 是 | Run 快照 |
| `pi_squad_team_scope` | Team Task 时 | 否 | Task 快照 |
| `pi_squad_roster` | 默认否 | 是 | Turn 动态 |
| `pi_squad_run` | 默认否 | 是 | Turn 动态 |

固定顺序的目的不是制造“后写覆盖前写”的隐式权重，而是让 Trace、测试和 Prompt Cache 行为稳定。稳定 section 放前，Roster/Run 等高变化 section 放后。

## 8. 推荐实现

当前：

```ts
return { systemPrompt: event.systemPrompt + "..." };
```

目标改为：

```ts
pi.on("before_agent_start", async (event) => {
  const sections = event.systemPromptOptions.sections;

  sections.pi_squad_protocol = buildProtocol(context.mode);

  if (context.mode === "role") {
    sections.pi_squad_role = context.rolePrompt;
    sections.pi_squad_role_working = context.roleWorkingInstructions;

    if (context.task?.teamScope) {
      sections.pi_squad_team_scope =
        buildWorkerTeamScope(context.task.teamScope);
    } else {
      delete sections.pi_squad_team_scope;
    }

    delete sections.pi_squad_team;
    delete sections.pi_squad_roster;
    delete sections.pi_squad_run;
    return;
  }

  delete sections.pi_squad_role;
  delete sections.pi_squad_role_working;
  delete sections.pi_squad_team_scope;

  sections.pi_squad_team = context.teamInstructions;
  sections.pi_squad_roster = buildRoster(context.roster);
  sections.pi_squad_run = buildRunState(context.runState);
});
```

实现要求：

- 不重写 `event.systemPromptOptions.contextFiles`，项目 `AGENTS.md` 继续由 Pi 管理；
- 不返回 `systemPrompt`，除非未来确有“完整替换 Pi system prompt”的特殊场景；
- 每次 Turn 明确删除当前模式不该存在的 Squad section，防止状态残留；
- Role / Team 原文不要从 Controller Registry 广播，Controller 保存 ID、hash、版本和必要快照引用；
- 正式 Task 使用 acquire 时冻结的配置字节/hash，不在 `before_agent_start` 临时再次读盘造成 TOCTOU；
- Leader 的 Roster/Run 动态状态必须来自当前 Controller 快照，不从模型历史反推。

## 9. Precedence：不使用“谁在后面谁更高”

这些 section 都会作为 system-level context 到达模型，不能把数组顺序当可靠授权机制。

### 9.1 代码层硬边界

以下内容必须由 Controller / Extension 强制：

- mode、agent_id、team_id、task/attempt 绑定；
- TeamMembership 和调用授权；
- active tool set / tool_call block；
- ExecutionLease / capacity / write reservation；
- DAG dependency；
- review/rework budget；
- final completion gate。

Markdown 只能解释这些约束，不能放宽它们。

### 9.2 Prompt 内语义边界

`pi_squad_protocol` 应明确 Domain 所有权：

```text
- Project Context defines repository-specific implementation constraints.
- Role Identity defines the responsibilities and behavioral boundaries of this role.
- Role Working Instructions refine how this role performs its work.
- Team Context defines collaboration and delegation rules for the current team.
- Current Task defines the objective within all of the above constraints.
- No Role or Team instruction may grant tools, permissions, membership, or execution authority that the runtime did not grant.
```

发生冲突时不要依靠“最后出现的 Markdown 胜出”：

- Team 要求使用某工具，但项目/运行时禁止：禁止；
- Role 要求修改文件，但工具策略为 review-only：禁止；
- Team routing 与 TaskContract target 不一致：Controller 拒绝；
- 项目规则与 Role 工作习惯冲突：以明确项目约束执行，并记录冲突；必要时让任务进入 blocked/needs_decision；
- Team instructions 与固定 Role 身份明显矛盾：配置校验或 Leader 决策失败，不静默覆盖 Role。

## 10. Prompt Cache 与更新策略

为了减少动态 Team 状态导致的系统前缀变化：

```text
较稳定
Pi Base
Project Context
Skills
CWD
Pi Squad Protocol
Role / Team static snapshot
---------------------------
较动态
Roster
Run State
Current Task
```

在 Pi 的 section 机制下，动态 section 可以独立产生 system-message patch；这比每轮重写完整 `forceSystemPrompt` 更适合长会话。

注意：Prompt Cache 是性能优化，不是正确性边界。Roster 或 Run State 变化时必须更新，即使会降低缓存命中。

## 11. 对当前实现的改造落点

### 11.1 Extension

建议：

```text
pi_squad/extension/
├── config.ts
├── context-assembler.ts      # 新增：纯函数组装 Squad sections
├── task-context.ts           # 后续：读取冻结 Task/Attempt Context
├── team-context.ts           # 后续：Team/roster/run DTO -> section
└── index.ts                  # 生命周期接线，不手工拼完整 systemPrompt
```

具体增量：

1. 将当前 `rolePrompt` 字符串追加逻辑迁入 `context-assembler.ts`；
2. `config.ts` 按 Team Runtime 契约增加 role `agents.md` 精确加载；
3. Leader 模式增加 Team config / instructions snapshot；
4. 正式任务由 task runtime 提供冻结 context，而不是 `before_agent_start` 再自由读取；
5. Leader 每次 Turn 从 Controller 取得必要的 Roster / Run State；
6. `/squad-whoami` 增加各 section 的来源、hash/version 和是否注入，不打印敏感正文时至少显示摘要；
7. Trace 验证从搜索一个 `Pi Squad role` 字符串改为检查固定 section/tag。

### 11.2 Controller

Controller 不负责渲染完整 Pi system prompt，但必须提供可验证的输入：

```text
TeamSnapshot
RosterSnapshot
RunContext
TaskContract
ContextRevision
role_working_instructions_hash
team_config_hash / config_version
```

Controller 是 Runtime Truth；Extension 是 Pi Context Adapter。

## 12. 建议的数据接口

可以先使用内部 DTO，不要求立即暴露为公网 API：

```ts
type SquadContextAssembly = {
  mode: "role" | "leader";
  protocolVersion: string;

  role?: {
    roleId: string;
    rolePrompt: string;                 // process snapshot
    workingInstructions: string;        // attempt snapshot
    workingInstructionsHash: string;
  };

  team?: {
    teamId: string;
    configVersion: number;
    configHash: string;
    instructions: string;               // run snapshot, leader only
  };

  teamScope?: {
    teamId: string;
    leaderAgentId: string;
    responsibility: string;
  };

  roster?: TeamRosterSnapshot;           // leader turn only
  runState?: SquadRunContext;             // leader turn only
};
```

TaskContract 与该对象分开，避免把一次 Task 目标误当角色或 Team 长期配置。

## 13. 验收清单

| ID | 场景 | 通过标准 |
|---|---|---|
| CTX-01 | 项目已有 `AGENTS.md`，启动 Role Pi | Pi 原生 `project_context` 保留；Squad 不改文件字节。 |
| CTX-02 | reviewer Role | 最终请求同时存在 `project_context`、`pi_squad_role`、`pi_squad_role_working`。 |
| CTX-03 | Role Team Task | 只看到当前 Team scope；不看到其它 Team 完整 instructions/roster。 |
| CTX-04 | Leader Task | 看到当前 Team instructions、roster、run state；不加载其它 Team。 |
| CTX-05 | mode=leader | 首版不额外加载普通 `role.md/agents.md`；与启动契约一致。 |
| CTX-06 | 修改 `role.md` | 当前进程不热切换；重启后更新。 |
| CTX-07 | 修改 role `agents.md` | 当前 Attempt 保持原 hash；下一 Attempt 使用新内容。 |
| CTX-08 | 修改 Team instructions | 活跃 Run 保持旧 snapshot；新 Run 使用新版本。 |
| CTX-09 | 成员上下线/忙闲变化 | 下一 Leader Turn 的 roster section 更新，不改 Team config snapshot。 |
| CTX-10 | Trace 最终 provider request | 能分别定位 Pi project_context 与 Squad 固定 sections；不存在整串 forceSystemPrompt 覆盖。 |
| CTX-11 | Tool/Role 冲突 | Tool policy 代码层阻止越权；Prompt 文本不能放行。 |
| CTX-12 | Team/Role/Project 规则冲突 | 不采用“后出现文本覆盖”；按 Domain/硬约束处理并产生可追溯错误或阻塞。 |
| CTX-13 | `/new` / reload | 不把上一 Team/Run 的动态 section 错带入不相关 Turn。 |
| CTX-14 | Prompt cache | 静态 section 内容和顺序稳定；动态 section 仅在事实变化时更新。 |

## 14. 实施顺序

```text
1. 先把当前 role 注入从 forceSystemPrompt 改为 structured section
2. 补 role/agents.md snapshot
3. 增加 Role TeamScope
4. 增加 Leader Team snapshot
5. 增加 Leader Roster / Run State 动态 section
6. 将正式 TaskContract 与 system context 分离
7. 用 pi-trace 验证最终 provider payload
8. 再开始成语接龙 / DAG Team orchestration
```

第一步应在真正 Team 编排前完成，否则 Team Runtime 会建立在不可分割的 system prompt 拼接方式上，后续每增加一个动态上下文都增加冲突和可观测成本。

## 15. 与参考项目的关系

- **Multica**：借鉴 Agent Instructions + 当前 Squad briefing、Leader 只拿当前 Squad、Roster 动态生成的思想；不照搬“把 runtime brief 写入 AGENTS.md”的多 Harness 兼容策略。
- **pi-subagents**：借鉴 Role system prompt 与 project context 分层、可选择继承上下文的思想；本项目不创建一次性 child session 来承载角色。
- **pi-agent-teams**：借鉴 Team identity 作为额外 system context、具体 Task 通过 RPC/user prompt 投递的思想；本项目增加正式 RoleDefinition、TeamDefinition、Controller 和冻结 TaskContract。
- **Pi Core**：直接使用 `systemPromptOptions.sections` 作为实现基线，项目 `AGENTS.md` 继续由原生 ResourceLoader 管理。

## 16. 最终约束

阶段 04 的 Context Assembly 统一为：

```text
文件仍然分开
        ↓
各自按自己的生命周期形成 snapshot
        ↓
Pi Squad Extension 组装结构化 system sections
        +
Pi 原生 project_context
        +
当前 TaskContract
        ↓
最终 LLM Request
```

不生成“超级 AGENTS.md”，不把所有 Team 配置塞给每个 Agent，不把运行态写回 Role/Team 配置，也不把 Prompt 顺序当作权限机制。
