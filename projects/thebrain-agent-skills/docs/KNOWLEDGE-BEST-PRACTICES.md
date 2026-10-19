# TheBrain 最佳实践：面向 AI 辅助知识管理与学习

> 来源：[官方 Tutorials](https://www.thebrain.com/support/tutorials)、[Big Thinkers](https://www.thebrain.com/big-thinkers)、[官方支持](https://www.thebrain.com/support)。以下为**项目归纳的工作准则**，不是 TheBrain 厂商逐条公开的规范。案例为设计示例，未声称亲测。

## 1. 十四条优先执行的准则

1. **关系优先于目录**：一个 Thought 代表稳定的概念、问题、决策或对象；需要多个上下文时，通过 Link 重用，不复制多个同名文档。
2. **区分父子、Jump、Sibling**：父子表层级/包含，Jump 表跨主题语义连接，Sibling 表并列；不要把所有相关性压成父子关系。
3. **一个 Thought 一个可辨认主题**：名称能在脱离父节点时被理解，避免“研究”“笔记”“其他”这种不可辨认的标题。
4. **节点摘要与 Notes 证据分层**：Thought 表“是什么”，Notes 保存“为什么、来源、例子、反例、争议、下一步”；事实不可仅以 AI 口述取代来源。
5. **先检索再创建**：名称精确匹配只返回第一个，不保证唯一；同时查看邻域与相近词，人工/Agent 判断是否复用。
6. **连接必须有解释**：每条跨域关系在 Note 中记录语义与依据；Link Types 能表达关系含义时优先使用，CLI 不支持时由 Note 显式保存。
7. **Types 少而稳定，Tags 弹性扩展**：Types 是对象类型（Concept/Question/Evidence/Decision/Project），Tags 表领域、阶段、优先级；避免同义标签爆炸。
8. **利用局部邻域而非全脑遍历**：从任务/问题 Thought 出发，读取 graph、notes、关联对象，用有边界的上下文提供给 AI。
9. **捕获与归纳分开**：原始输入先标记待处理，研究完成后再拆解、去重、补链接；不能把未经核验的 AI 推断升级为事实。
10. **让未解决的问题显性存在**：Question 关联证据、假设和验证动作；后续学习/检索以“问题”而不是泛泛主题为入口。
11. **记录来源、版本与判断状态**：每条高价值断言包含出处、时间与 `verified / hypothesis / deprecated` 等状态；不要无标记覆盖旧判断。
12. **持续整理而非一次性重构**：以日常 capture + 周度 review 修复孤立节点、重复概念、过期结论、缺失连接。
13. **检索场景需要速度与证据**：搜索服务更新可能延迟（规范建议等待最多约 15 秒）；写后直接用 ID 读取验证，别把搜索暂时缺失判成写入失败。
14. **将学习过程建立在知识之上**：TheBrain 保存教材和概念图，记忆练习的正确率/复习间隔属于学习状态存储，而非 Thought 事实属性。

## 2. 官方能力与实践映射

| 官方主题 | 在本项目的执行方式 |
| --- | --- |
| Thoughts & Links | 建模 Parent / Child / Jump / Sibling，优先复用而非复制 |
| Notes & Attachments | Notes 存总结和论证，附件/URL 存可追溯的来源 |
| Search & Navigation | 搜索召回 + Graph 邻域 + Notes 证据；明确检索范围 |
| AI: Creating Thoughts | AI 建议结构，先展示 diff，由用户/规则审核后写 |
| AI: Creating Notes | 生成内容要附来源和事实状态；变更防止覆盖原文 |
| Tags / Thought Types / Link Types | 分类粒度受控，关系有语义；API 能力缺口明确标记 |
| Mapped Links, Backlinks, Unlinked Mentions | 发现潜在关联，候选不自动变成事实性边 |
| Forgetting / Deleting | 归档/隐藏优于误删；破坏性操作需要独立准入 |
| Timeline / Reports / History | 变化与复盘；必要时采用修改日志审计 |
| Import/Export | 批量操作前保存测试库快照，避免不可恢复批量污染 |

## 3. Big Thinkers 启发：不要误记成官方硬性规则

- Jerry Michalski：长生命周期的大型知识网；重点是持续连接、演进而非完美分类。
- Mark Trexler / Climate Web：复杂问题需要多视角网络，而不是单一路线的答案树。
- James Burke：跨主题链接本身能够产生新的洞察，尤其适合知识迁移。
- David Allen：想法与可执行项目/下一步动作需要区分，知识图谱不应替代完整的任务执行工具。
- TheBrain 教育应用与项目管理案例：课程、概念、材料、人物、判断可共享节点，不必为每个项目复制一遍。

这些是从公开活动简介抽象出的产品启发，**不构成观看所有视频后的逐条摘录或经实证检验的结论**。

## 4. 具体示例：学习“多智能体协同”

假设目标是回答“什么条件下多智能体比单智能体有价值”。

```text
Project: 多智能体协同（研究目标）
├── Question: 什么任务值得多 Agent？
│   ├── Hypothesis: 独立并行能提升吞吐
│   ├── Evidence: 论文/实现/评测（附出处）
│   └── Experiment: 单 Agent vs 多 Agent 对照
├── Concept: Task Contract
├── Concept: Dependency DAG
├── Concept: Acceptance Gate
├── Decision: 本次实验采用的治理策略
└── Review: 开放问题与下一轮验证
```

另外建立 Jump：`Task Contract ↔ DDD 的明确边界`、`Acceptance Gate ↔ 软件测试`、`主动回忆 ↔ 学习 Skill`。对每一条 Jump 写清“为什么有关”；不要只因为 AI 认为两个词相似便建边。

单个 Concept Thought 的 Notes 模板：

```markdown
# 核心定义
一句可独立理解的话。

## 为什么重要
关联的任务、问题与反例。

## 证据与出处
- URL / 书页 / 源码路径 / 日期
- verified | hypothesis | needs-review

## 与其他 Thought 的关系
- [相邻 Thought]：关联语义

## 尚不确定
- 需要验证的问题
```

## 5. AI 辅助操作 SOP

`capture → classify → search/dedupe → propose structure → review diff → write → readback verify → log`

写入审核必须展示：目标 Brain、源 Thought、创建/修改清单、Link 方向、Note 差异、重复候选、证据、风险；不能仅有“生成了 N 个节点”。

## 6. 演进与治理指标（先做轻量）

- 检索：给定问题能否在 3 次以内定位相关 Thought 与证据。
- 结构：孤立节点率、重复节点率、无解释 Jump 的比例。
- 质量：关键结论带来源的比例、过期判断被标记的比例。
- AI 操作：预览/执行一致性、写入回读一致性、幂等重试、错误恢复。
- 学习：回答正确性、能否解释迁移、复习后的保持效果；不能仅以新增知识数量代替学习效果。
