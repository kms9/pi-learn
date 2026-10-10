可以开始实践了。基于我们现有的研究框架、Pi Squad 已完成的能力，以及我补充检索到的最新单/多智能体对比证据，我建议把下一阶段明确成：

> **不再验证“能不能多智能体”，而是实验性回答：什么时候多智能体产生净收益，以及收益究竟来自哪一种编排机制。**

而且你的基线需要非常强：你写的 `oups5.5` 我理解为 **Claude Opus 5.5**。它目前已经是 1M 上下文、面向长时间智能体编码与知识工作的强单智能体模型，因此这反而是很好的基线：**如果多智能体连强单智能体都赢不了，就没有引入额外组织复杂度的必要。** [platform.claude.com](https://platform.claude.com/docs/en/models/opus-5-5/overview?utm_source=chatgpt.com)

---

# 一、先修正一个问题：不存在普遍意义上的“单智能体绝对做不了”

更严谨的说法应该是：

> **在给定时间、上下文、工具、权限、可靠性和治理约束下，哪些任务无法由单智能体经济、可靠地完成，因此工程上需要多智能体。**

这是非常重要的区别。

例如一个研究任务，给单智能体 10 小时、无限上下文，也许能做完。但如果要求：

- 20 分钟内搜索 100 个对象；
- 每个对象都要独立核验；
- 最终不能遗漏；
- 需要两个独立来源交叉确认；

那么“并行 Agent”就从可选优化变成了接近必要条件。

Anthropic 的结果非常典型：多智能体研究系统在其内部研究评测上比单 Opus 4 高 **90.2%**，尤其适合需要同时探索多个独立方向的“宽度优先”任务；但代价是多智能体 Token 消耗约为普通聊天的 15 倍，而且 Anthropic 明确指出，高依赖、需要共享同一上下文的任务并不适合多智能体。[Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system?trk=article-ssr-frontend-pulse_little-text-block)

因此我建议我们以后使用下面这个公式理解多智能体：

> **多智能体净价值 = 并行收益 + 上下文扩展收益 + 专业化收益 + 独立验证收益 + 治理收益 − 协调成本 − 集成成本 − 上下文碎片化 − 推理成本**

我们的实验就是把这几个变量一个个测出来。

---

# 二、哪些场景真正值得多智能体

我把目前官方实践和研究结果归纳成下面这张表。

| 场景 | 单智能体的结构性限制 | 最合适的策略 | 多智能体价值 |
|---|---|---|---|
| **大范围独立检索** | 搜索必须串行，覆盖不足 | 扇出—聚合（Fan-out / Gather，扇出并行后聚合） | 极高 |
| **固定时限下的大任务** | 单 Runtime（运行时）只能串行推进 | 任务依赖图 + 并行 Worker（执行智能体） | 极高 |
| **多个独立模块** | 一个上下文同时维护大量局部细节 | 任务依赖有向无环图 + 文件/模块所有权 | 高 |
| **内容超过单上下文的长任务** | 长上下文不断压缩、遗忘、污染 | 阶段性交接 + 交付物 | 高 |
| **必须独立验证** | 生成者自己验证自己，错误高度相关 | Executor → Reviewer → Auditor（执行者→评审者→审计者） | 极高 |
| **工具/权限差异很大** | 一个 Agent 工具过多、权限过宽 | 专业角色 + 有界工具集 | 高 |
| **任务结构无法预先确定** | 中央 Planner（规划者）提前拆错 | 动态任务认领池 | 高 |
| **大量开放式改进机会** | Planner 不知道有哪些工作 | Dynamic Claim Pool（动态任务认领池） | 高 |
| **多模态生产流水线** | 脚本、图片、动画、音频、合成相互挤占上下文 | 专业角色 + 交付物流水线 | 高 |
| **合规上的职责分离** | 同一身份不能既操作又批准 | 独立执行 / 验收 Runtime | 必须 |

OpenAI 当前的官方指导其实相当保守：首先尽量增强单 Agent；独立任务才适合交给子 Agent，而短任务、强依赖步骤应该留在主 Agent；多个 Agent 修改相同文件时尤其需要谨慎协调。[OpenAI](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/?utm_source=chatgpt.com)

这和 Anthropic 的结论基本一致。

---

# 三、有几个场景我们应该故意验证“多智能体会输”

这是实验里不能少的一组**负对照**。

### 1. 单页、小规模互动模块

例如：

> 给定一道二次函数题，生成一个完整可交互讲解页面。

Opus 5.5 一个 Agent 已经可以：

理解需求 → 设计交互 → 写 Vue/HTML → 调试 → 修改。

再拆成 Planner、Designer、Coder、Reviewer，很可能只是增加沟通。

### 2. 高耦合跨文件修改

例如：

> 给现有课件系统增加一个贯穿所有页面的统一状态模型。

这种修改需要一个统一心智模型。

CooperBench 是非常值得我们纳入对照的证据：600 多个真实软件协作任务中，两个 Agent 协作的成功率平均反而比一个 Agent 完成全部工作低约 **30%**，主要失败来自：

- 对队友状态的错误预期；
- 通信失败；
- 做出承诺后不执行；
- 修改互相冲突。[arXiv](https://arxiv.org/abs/2601.13295?utm_source=chatgpt.com)

所以：

> **模块可拆 ≠ 适合 Agent 拆。**

必须同时满足“低耦合”。

### 3. 多 Agent 自由讨论

这个也应该作为负对照。

简单让：

> 数学专家 + 教学专家 + 设计专家讨论一下。

并不意味着结果更可靠。

对多智能体辩论的系统评测显示，很多方法并不能稳定超过单智能体思维链或自一致性方法。[arXiv](https://arxiv.org/abs/2502.08788?utm_source=chatgpt.com)

所以我们需要区分：

**自由讨论**

和：

**Builder → Artifact → Evidence → Reviewer → Acceptance**

后者才是我们真正想研究的东西。

---

# 四、因此，我们最核心的实验不是 Single vs Multi，而是 7 个假设

我建议直接把下面七个假设作为后面的实验主线。

| 假设 | 要证明什么 |
|---|---|
| **H1 并行收益** | 可独立拆分的任务，多个 Agent 是否降低端到端耗时并提高覆盖率 |
| **H2 协调成本** | 高耦合任务中，多 Agent 是否反而降低成功率 |
| **H3 独立验证收益** | 独立 Reviewer / Auditor 是否显著降低缺陷逃逸 |
| **H4 异质性收益** | 不同角色 / 工具 /模型是否优于简单增加同质 Agent |
| **H5 工作分解收益** | 明确任务依赖图是否优于自然语言自由协作 |
| **H6 自组织收益** | 开放任务中动态认领是否优于中央预先分派 |
| **H7 工作契约收益** | Task Contract（任务契约）是否显著减少交接错误和伪完成 |

特别是 H4 很值得测。2026 年的一项 Agent Scaling（智能体扩展）研究发现，同质 Agent 很快出现收益递减，而增加模型、工具或提示词的异质性更有效；实验中甚至出现 **2 个异质 Agent 达到或超过 16 个同质 Agent** 的情况。[arXiv](https://arxiv.org/abs/2602.03794?utm_source=chatgpt.com)

这意味着我们的目标不应该是：

> 1 Agent → 4 Agent → 16 Agent。

而应该首先研究：

> **增加一个什么样的 Agent，会引入新的有效信息通道？**

---

# 五、实验基线必须这样设计

建议所有实验都固定：

### B0｜强单智能体基线

```text
Claude Opus 5.5
+
同一个 Pi Runtime
+
相同 Skill
+
相同工具
+
相同 Workspace
+
相同素材
+
相同验收标准
```

允许 Agent：

- 自己规划；
- 自己使用工具；
- 自己执行测试；
- 自己修改；
- 自己反思。

这才是公平的 Single Agent（单智能体）基线。

---

### B1｜单智能体 + 强流程

再增加：

```text
Plan
→ Execute
→ Check
→ Fix
```

这是为了排除：

> 多 Agent 赢了，其实只是因为它被强制用了更好的 SOP（标准作业流程）。

---

### B2｜执行者 + 独立 Reviewer

这是我认为**非常重要的中间组**：

```text
Opus 5.5 Executor
        ↓
Artifact
        ↓
Opus 5.5 Reviewer
```

很多场景可能最终发现：

> **最经济的不是 5 Agent Team，而是 1 Agent + 1 独立验收 Agent。**

---

# 六、Pi Squad 中需要实现的主要实验组

然后才进入真正的编排实验。

## P1｜中央 DAG 编排

```text
Goal
 ↓
人工固定 Work Decomposition（工作分解）
 ↓
Task Dependency DAG（任务依赖有向无环图）
 ↓
Role
 ↓
Agent
 ↓
Artifact
 ↓
Acceptance
```

这个是我们的**标准实验组**。

主要测：

- DAG 是否减少遗漏；
- 是否提升并行度；
- 是否降低上下文负担；
- 协调成本是多少。

---

## P2｜扇出—聚合

适合研究、素材和候选方案。

例如：

```text
              ┌→ 资料 Agent
Goal → Lead ──┼→ 教学设计 Agent
              ├→ 素材 Agent
              └→ 竞品 Agent
                     ↓
                   Gather
```

Anthropic 的 Research 系统本质就是这个模式。[Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system?trk=article-ssr-frontend-pulse_little-text-block)

---

## P3｜独立验证模式

```text
Builder
 ↓
Artifact
 ↓
Critic
 ↓
Challenger
 ↓
Auditor
 ↓
Acceptance
```

Google Teamwork 当前就是非常典型的这种设计：将实现角色与 Critic（批评者）、Challenger（挑战者）、Auditor（审计者）分离，并要求独立验收。[Google Antigravity](https://www.antigravity.google/docs/teamwork/?utm_source=chatgpt.com)

注意：

**这不是 Debate（辩论）。**

Reviewer 必须针对：

- 文件；
- 测试结果；
- 数据；
- 浏览器行为；
- 数学结果；

提出 Evidence（证据）。

---

## P4｜层级委派

```text
Goal
 ↓
Leader
 ├→ Teaching
 │    ├→ Research
 │    └→ Exercise
 └→ Implementation
      ├→ UI
      └→ Test
```

主要测：

> 当 Work Structure（工作结构）变大时，Leader 是否变成瓶颈。

---

## P5｜动态任务认领池

这个就是 Agensh 给我们的实验。

```text
Goal
 ↓
Shared Work Pool
 ↓
Agent 自己发现工作
 ↓
CLAIM
 ↓
Execute
 ↓
Evidence
 ↓
Merge
```

Agensh 在 ProgramBench 的五个困难软件重建任务中，将 Agent 从 1 扩到 128，平均测试通过率从 19.31% 提升到 28.78%；关键不是中央 Planner 更强，而是 Worker 自己发现和认领任务。[arXiv](https://arxiv.org/abs/2609.26781?utm_source=chatgpt.com)

---

## P6｜DAG + Claim Pool 混合

我认为这个最终可能最符合我们的系统。

```text
Goal
 ↓
Backbone DAG
 ↓
Milestone
 ├── 已知任务 → 显式 DAG
 └── 未知机会 → Claim Pool
```

例如：

```text
生成课件
 │
 ├── 教学目标
 ├── 页面骨架
 ├── 核心互动
 │
 └── Quality Improvement Pool
       ├── 无障碍问题
       ├── 动画问题
       ├── 事实问题
       ├── UI问题
       └── 性能问题
```

这比要求 Planner 在开始时把所有问题预测出来合理得多。

---

# 七、最适合我们的第一批“多模态实验工作台”任务

这是我认为最有价值的一部分。

不要用抽象 benchmark 做第一轮。

直接使用我们的真实工作对象：

> **教学互动模块 / 互动实验 / 多模态课件。**

我建议先建立下面 **8 类任务集**。

| 编号 | 实验任务 | 预期最佳策略 | 实验价值 |
|---|---|---|---|
| T1 | 清晰需求生成一个互动页面 | 单 Agent | 负对照 |
| T2 | 对已有完整课件做跨页面统一修改 | 单 Agent | 验证上下文连续性 |
| T3 | 检索大量资料后生成有引用的互动讲解 | 扇出—聚合 | 验证并行研究 |
| T4 | 数学/物理互动实验：知识→设计→代码→验证 | DAG | 验证专业分工 |
| T5 | 8～12 页面大型课件 | DAG + 并行 | 验证模块化生产 |
| T6 | 对已有课件发现尽可能多的问题并优化 | Claim Pool | 验证自组织 |
| T7 | 图片 + 动画 + 配音 + 页面组合 | 异质 Team | 验证多模态生产 |
| T8 | 故意注入知识错误 / UI Bug / 边界错误 | Builder + Reviewer + Auditor | 验证独立验收 |

其中 T7 特别值得做。

Google 今年做过一个非常相似的实验：三个角色分别负责创意、生成媒体、编辑，最终生产短片；一个 4 分钟影片涉及 40+ 次图片生成、25+ 视频片段、音乐、语音和数百次合成操作。Google 得出的一个重要经验就是：**智能体通过共享文件和结构化产物协作，比仅依赖消息历史可靠得多。** [Google Cloud](https://cloud.google.com/blog/topics/developers-practitioners/what-we-learned-about-agent-teamwork)

这跟我们的：

```text
lesson-outline.json
script.md
image/*
audio/*
animation/*
courseware.vue
evaluation-report.json
```

非常接近。

---

# 八、其中最关键的实验，我建议先做这四个

如果马上进入实现，我不会一开始做 8 类。

先跑四个。

## EXP-01｜单页互动模块

验证：

> Multi-Agent 是否其实没有价值。

对比：

```text
B0 单 Opus 5.5
B1 单 Opus 5.5 + SOP
P1 三角色 DAG
```

目标：

证明我们不是为了证明多 Agent。

---

## EXP-02｜复杂互动实验

例如：

> 根据一个数学 / 物理知识点，生成完整互动实验。

拆成：

```text
教学目标
   ↓
学科正确性
   ↓
交互设计
   ↓
可视化实现
   ↓
浏览器测试
   ↓
教学质量验收
```

对比：

```text
Single Agent

vs

固定 DAG Team
```

这是最适合我们的**第一核心实验**。

---

## EXP-03｜独立验收

故意准备带隐藏 Bug 的任务。

例如：

- 数学公式错误；
- SVG 坐标边界错误；
- 动画状态错误；
- 答案判断错误；
- 移动端布局问题；
- 无障碍问题。

比较：

```text
Single Agent Self Review

vs

Executor + Reviewer

vs

Executor + Reviewer + Auditor
```

测：

> **Defect Escape Rate（缺陷逃逸率）。**

这可能会是工作台多智能体最容易证明价值的地方。

---

## EXP-04｜开放式优化任务

输入：

> 这是一个已经能够运行的互动课件，30 分钟内尽可能改善它。

不给具体 Task。

对比：

### 中央 Planner

```text
Leader
→ 一次性拆任务
→ DAG
```

和：

### Dynamic Claim Pool（动态任务认领池）

```text
多个 Agent
→ 查看当前状态
→ 自主发现问题
→ Claim
→ 修改
→ 验证
```

这个实验可以直接验证我们昨天从 Agensh 得出的最重要问题：

> **什么时候中央任务分解应该让位于运行时工作发现？**

---

# 九、评价指标必须从“Agent 是否完成”升级成系统指标

最重要的是下面这些。

| 维度 | 指标 |
|---|---|
| 最终效果 | Goal Success（目标成功率） |
| 正确性 | 自动测试通过率 |
| 教学质量 | 教学 Rubric（评价量表） |
| 知识质量 | 事实 / 数学正确率 |
| 互动质量 | 浏览器端交互测试成功率 |
| 完整性 | Requirement Coverage（需求覆盖率） |
| 稳定性 | 多次运行成功率 |
| 成本 | Token / API 成本 |
| 时间 | 端到端 Wall Clock（墙钟时间） |
| 并行 | Parallel Efficiency（并行效率） |
| 协调 | Message / Handoff 数量 |
| 重复劳动 | Duplicate Work Rate（重复工作率） |
| 冲突 | Artifact / File Conflict（产物 / 文件冲突） |
| 返工 | Rework 次数 |
| 验收 | Acceptance Reject Rate（验收拒绝率） |
| 人工 | Human Intervention（人工介入次数） |
| 恢复 | Failure Resume Success（故障恢复成功率） |

尤其不要只看：

```text
最终分数
```

要同时记录：

```text
最终分数
÷
Token
÷
时间
÷
人工介入
```

---

# 十、实验必须跑两种预算，否则会得出错误结论

这是一个非常关键的实验设计。

Anthropic 已经发现，研究任务的性能提升相当大一部分其实由 Token 增加解释；其分析中 Token 使用量本身解释了 BrowseComp 约 80% 的性能方差。[Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system?trk=article-ssr-frontend-pulse_little-text-block)

所以必须分别跑：

### 实验 A｜等成本

例如：

```text
Single：100k Token
Multi：总计100k Token
```

回答：

> 编排本身有没有价值？

---

### 实验 B｜等时间

例如：

```text
Single：30分钟
Multi：30分钟
```

允许 Multi 使用更多 Token。

回答：

> 如果真实产品限制是交付时间，并行计算是否值得花钱？

这两个结论完全可能不同。

例如：

```text
等 Token：
Single > Multi

等 30 分钟：
Multi >> Single
```

那么就意味着：

> 多智能体不是提高单位智能，而是用计算换时间。

这也是一个非常有价值的产品结论。

---

# 十一、Pi Squad 和 Multica 不应该一上来直接 PK

这一点我建议特别注意。

## Pi Squad

更适合当：

> **多智能体机制实验室。**

因为我们现在已经具备：

- Task；
- Attempt；
- Task Contract（任务契约）；
- Parent / Child；
- DAG；
- Role；
- Team；
- Reviewer；
- Rework；
- Acceptance；
- Lease；
- Durable State（持久状态）；
- Trace（执行轨迹）。

而且阶段 04 已经通过 89/89 项验收。

所以它非常适合回答：

> **编排策略有没有因果价值。** 

---

## Multica

更适合第二阶段验证：

> **这种工作模型能不能进入真实“数字员工”式工作环境。**

Multica 当前本身就明确：

- Issue；
- Agent；
- Runtime；
- Squad；
- Skills（技能）；
- Run；
- Review。

它的 Squad 机制是：

> Leader 先被唤醒，然后由 Leader 判断下一步工作交给哪个成员。

它本身并不是“自动把所有 Agent 并行拉起来”。[GitHub](https://github.com/multica-ai/multica?utm_source=chatgpt.com)

所以：

### 第一阶段

```text
Pi Squad
→ 验证 Collaboration Pattern（协作模式）
```

### 第二阶段

```text
相同 Work Contract（工作契约）
→ Multica
→ Pi Squad
```

验证：

> **相同 Work Unit（工作单元）在不同控制面 / Runtime 系统下是否仍然成立。**

这正好进入我们之前提出的问题：

> 不同 Runtime 如何执行同一种 Work Contract？

---

# 十二、这个实验最终会反过来改变“多模态实验工作台”

如果这些实验成立，我认为工作台真正需要增强的不会是一个：

> “开启 Multi-Agent”按钮。

而是增加下面几层。

```text
教学 Goal
   ↓
Work Structure
   ├─ DAG
   └─ Claim Pool
   ↓
Work Unit
   ↓
Role / Skill
   ↓
Runtime
   ↓
Artifact
   ↓
Evidence
   ↓
Acceptance
```

工作台最终应该能显示：

### ① 工作结构

```text
Goal
→ Milestone
→ Task
→ Dependency
```

### ② 当前责任

```text
Task
→ Role
→ Agent
→ Runtime
```

### ③ 实际产物

```text
Task
→ Artifact
```

而不是只看到聊天消息。

### ④ 验收证据

```text
Artifact
→ Test
→ Screenshot
→ Browser Result
→ Education Eval
```

### ⑤ 为什么启动多个 Agent

系统应该能够解释：

```text
为什么不是单 Agent？

因为：
独立子问题 = 5
预计并行收益 = 高
上下文隔离收益 = 高
独立验证要求 = 是
文件重叠 = 低
```

最后才得出：

```text
建议：
Fan-out + Independent Review
```

而不是默认：

```text
复杂任务
→ Multi-Agent
```

---

# 十三、我认为现在可以形成一个新的核心判断

我们之前的模型是：

```text
① 工作结构
Goal → Work Decomposition → Task Dependency DAG

② 组织结构
Responsibility Tree → Role → Squad

③ 协作结构
Pattern → Handoff / Fan-out / Hierarchy / Review

④ 治理结构
Task Contract → Artifact → Evidence → Acceptance

⑤ 执行结构
Task / Run / Session / Runtime → Durable State → Trace
```

Agensh 又让我们增加：

```text
Dynamic Claim Pool
```

现在通过实验这一步，还应该在最前面再增加一个决策：

```text
Goal
 ↓
Single / Multi Decision
 ↓
Work Structure
```

也就是：

> **R1 不应该只是“什么时候需要 Multi-Agent”，而应该真正形成一个 Multi-Agent Admission Policy（多智能体准入策略）。**

未来每一个任务首先判断：

```text
可并行度？
上下文压力？
独立验证价值？
异质能力需求？
资源冲突？
工作结构确定性？
时间约束？
协调成本？
```

然后决定：

```text
Single Agent
       or
Single + Reviewer
       or
Fan-out
       or
DAG
       or
Hierarchy
       or
Dynamic Claim
       or
DAG + Claim
```

**这可能比“自动任务分解”更应该成为我们下一阶段首先研究的东西。**

因为最终真正有价值的系统不是一个“会启动很多 Agent 的系统”，而是一个：

> **知道什么时候不应该启动多智能体，以及一旦启动，知道为什么选择这种组织方式的 Work System（工作系统）。**

这会把我们现在讨论的 **Work Unit、DAG、Dynamic Claim Pool、Responsibility Tree、Role、Skill、Harness（运行控制框架）、Runtime、ACP（智能体客户端协议）** 全部放到同一个可验证框架里，而不再只是概念清单。
