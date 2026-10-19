---
name: thebrain-knowledge
description: 使用 TheBrain Local API 通过 brainctl 捕获、拆解、检索、去重、连接并维护知识图谱；写入始终需预览和验证。
---

# Skill · TheBrain Knowledge Capture & Gardening

## 触发场景

- 用户希望把研究/阅读/项目资料整理成长期可维护的 TheBrain 知识网；
- 希望新增/更新 Thought、Notes、语义关联，并能够核验与回溯；
- 希望清理重复节点、孤立节点、过期或没有出处的结论。

**不得**仅因用户提问知识问题就擅自写入图谱。用户只想讨论、查询时遵循只读流程。

## 事实源与依赖

- 读取 `docs/api/docs.json` 与 `docs/KNOWLEDGE-BEST-PRACTICES.md`。
- 通过 `brainctl` 调用本机 API，不在 Skill 中重新写 HTTP 客户端。
- 由用户明确目标 `brainId`，禁止默认使用 UI 当前 Brain 写入。
- 当前 CLI 是 **只读 MVP**；所有后述创建/修改步骤是待 M2 完成后才能执行的设计，不得虚构命令。

## 工作流

### K0 · 明确任务

收集：目标 Brain、想解决的 Question/Project、输入材料与来源、可改变范围、不可更改的已有结论。识别输入是原始引用、作者观点、AI 推断还是已验证知识。

### K1 · 检索与上下文

命令示例：

```bash
brainctl search --brain-id BRAIN_UUID --query "Task Contract"
brainctl thought graph --brain-id BRAIN_UUID --id THOUGHT_UUID
brainctl note get --brain-id BRAIN_UUID --id THOUGHT_UUID
```

优先精确匹配、同义词与图邻域；发现重复候选必须报告，不得假设 `nameExact` 唯一。

### K2 · 拆解与归类

把材料抽取为 `Project / Question / Concept / Evidence / Decision` 候选；注意思想/判断与原始证据分开。拟定 Parent/Child/Jump/Sibling 关系及其含义。复用已有 Thought，禁止按文章自动复制全套相同概念。

### K3 · 提供变更预览

**必需输出字段**：

- `targetBrainId`（脱敏显示）
- `sourceThoughtId`（若新建关联）
- `proposedThoughts[]`：新建名称、Type、Note 摘要和出处
- `reuseThoughts[]`：已存在匹配、理由
- `proposedLinks[]`：起点/终点/关系类型/证据
- `noteDiffs[]`：保留现有段落，新增标记区域
- `risks[]`：冲突、重复、未知 API 语义、未经证实观点
- `verificationPlan`：需要回读的对象和预期 Graph 结构

### K4 · 写入（M2 以后）

没有 `--apply` 或明确批准时只展示计划，不能提交任何写请求。
优先局部变更：Thought 创建 → Link → Note 追加；每次收到 ID 后立即回读。
如果请求超时，先按来源/ID/时间检查是否已经写成功；追加 Notes 的重试尤其要防止重复。
修改/删除已有内容必须有原快照与恢复方式；高风险权限/删除操作另行审批。

### K5 · 验证与知识维护

验证真实 Thought、Graph 和 Note 的回读一致性。记录：新增/复用/冲突/拒绝/未完成的统计，更新来源与知识状态。周度审查孤立、重复、过期、缺少依据的节点，按小批次整理。

## 输出模板

```text
目标知识问题：
命中的既有知识（及 ID）：
新概念/证据/判断候选：
结构变化预览：
来源与不确定性：
执行状态：read-only / preview / applied+readback / blocked
后续需人工确认：
```

## 安全失败条件

- Key/本地 API 无法连接 → 停止；绝不模拟“成功创建”。
- Brain ID 未提供或跨 Brain 关系方向不明 → 拒绝写操作。
- 来源不足或实体去重不确定 → 标记候选供人工审查。
- 并发修改/重试后无法判定 → 中止并保存冲突状态，不自动覆盖用户笔记。

## 验收

三个真实材料案例，必须证明：复用已有节点、有出处的链接、预览与实际变更一致、失败回滚/补偿可解释；并明确记录是否通过真实 TheBrain 实机。
