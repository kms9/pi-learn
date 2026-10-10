有，而且 2026 年已经明显进入“多智能体 Benchmark（基准评测）开始成体系”的阶段。但先给结论：

> **目前已经有若干相当完整的多智能体协同 Benchmark，也开始出现统一评测框架和标准草案；但还没有一个 Benchmark 或正式标准，完整覆盖我们刚才定义的 `Work Structure → Collaboration → Contract → Artifact → Evidence → Acceptance → Durable State → Trace`。**

换句话说，我们**不需要从零设计评测体系**，但也不能直接拿某一个现有 Bench 当成我们的全部验收标准。

## 1. 目前最值得研究的 6 个项目

| 项目 | 核心评什么 | 对我们的价值 | 匹配度 |
|---|---|---|---:|
| **MASEval** | 整个多智能体系统，而不是单模型 | 最适合作为统一评测框架参考 | ★★★★★ |
| **MultiAgentBench / MARBLE** | 多智能体拓扑、协作与竞争 | 最适合 P1/P2/P4 编排策略比较 | ★★★★☆ |
| **TeamBench** | Planner / Executor / Verifier 强制角色分离 | 与我们的 Role / Contract / Acceptance 极其接近 | ★★★★★ |
| **CooperBench** | 真实代码协作、冲突、沟通、任务认领 | 最适合测协作是否真的优于单智能体 | ★★★★★ |
| **AgentWorld** | 长周期、3～20 Agent 的真实协作贡献 | 最新、过程评价理念非常值得吸收 | ★★★★☆ |
| **AWS MACS** | 企业多 Agent 场景、轨迹 + Assertions | 企业任务验收模型值得参考 | ★★★☆☆ |

---

# 2. MASEval：目前最接近我们要的“统一 Eval Harness”

这个我认为需要重点看。

MASEval 在 ACL 2026 已正式发表，它的核心观点恰好和我们最近的研究结论一致：

> **评估对象应该从 Model（模型）上升到完整 Agent System（智能体系统）。**

也就是说，不只比较：

```text
GPT-5.6
vs
Claude
```

而比较：

```text
Model
+ Agent
+ Prompt
+ Tool
+ Context
+ Coordination
+ Framework
+ Error Handling
```

整个系统。

它明确支持：

- Framework Agnostic（框架无关）
- Multi-Agent Native（原生多智能体）
- System-Level Eval（系统级评测）
- Trace-First（轨迹优先）
- Usage / Cost（Token / 成本）
- Exception Attribution（异常归因）
- 自定义 Benchmark
- 自定义 Evaluator（评测器）

执行生命周期也是：

```text
Setup
  ↓
Execute
  ↓
Collect Traces
  ↓
Evaluate
  ↓
Report
```

非常接近我们刚才定义的 Eval Harness。[GitHub](https://github.com/maseval/MASEval?utm_source=chatgpt.com)

更重要的是，MASEval 已经开始把现有 Bench 统一进去，目前包括：

- MACS
- MultiAgentBench / MARBLE
- GAIA2
- τ²-bench
- 其他 Benchmark。[GitHub](https://github.com/maseval/MASEval/blob/main/BENCHMARKS.md?utm_source=chatgpt.com)

但要注意成熟度：MASEval 自己也明确标注，目前部分 Benchmark 仍然是 Beta，文档称 MACS 是其中已经完整验证的一个。[maseval.readthedocs.io](https://maseval.readthedocs.io/en/latest/benchmark/?utm_source=chatgpt.com)

### 对我们的启发

我们之前定义：

```text
Run
→ Trace
→ Judge
→ Metric
→ Strategy Verdict
```

这和 MASEval 的方向高度一致。

所以我不建议重新造一个完全独立的 Eval 框架，而应该研究：

> **Pi `vitest-evals` 负责 Pi-native（Pi 原生）执行；我们的统一数据模型和 Evaluator 接口参考 MASEval。**

---

# 3. MultiAgentBench / MARBLE：目前最成熟的“编排策略 Bench”之一

MultiAgentBench 是 ACL 2025 Main，专门解决：

> 单智能体 Benchmark 无法衡量多 Agent 的 Coordination（协调）和 Competition（竞争）。

它不是只看最终成功率，而是加入：

> **Milestone-based KPI（基于里程碑的关键指标）**

然后明确比较：

```text
Star 星型
Chain 链型
Tree 树型
Graph 图型
```

以及：

```text
Group Discussion 群体讨论
Cognitive Planning 认知规划
```

等策略。[ACL Anthology](https://aclanthology.org/2025.acl-long.421/?utm_source=chatgpt.com)

这跟我们的：

```text
Pattern
→ Handoff
→ Fan-out
→ Hierarchy
→ Review
```

已经非常接近。

### 对应我们的实验

最适合：

- P1：中央 DAG
- P2：Fan-out / Gather（扇出 / 聚合）
- P4：Hierarchy（层级委派）

但是它仍然存在一个明显差异。

它更关注：

> **通信拓扑是否提升任务结果。**

而我们进一步关心：

```text
Dependency 是否满足
TaskContract 是否遵守
Artifact 是否存在
Evidence 是否有效
Acceptance 是否绕过
Recovery 是否正确
```

这一层 MARBLE 不够。

所以它能提供：

> **Pattern Benchmark（协作模式基准）**

不能直接成为：

> **Work System Benchmark（工作系统基准）。**

---

# 4. TeamBench：和我们当前设计最像的一个

这是我认为**最值得立即深入研究源码**的项目之一。

TeamBench 是 2026 年提出的 Benchmark，拥有：

- 851 个任务模板
- 931 个实例
- 19 类任务
- 5 种实验条件。[TeamBench](https://teambench.github.io/?utm_source=chatgpt.com)

它最特别的不是 Agent 数量，而是：

> **Role Separation（角色分离）不是 Prompt 约束，而是操作系统级约束。**

三个角色：

```text
Planner
规划者
│
│ 能看完整 Spec
│ 不能修改代码
↓
Executor
执行者
│
│ 能修改代码
│ 看不到完整 Spec
↓
Verifier
验证者
│
│ 能看 Spec + Workspace
│ 只能只读
↓
Acceptance
```

通过不同 Docker 容器的挂载权限真正实现。[TeamBench](https://teambench.github.io/?utm_source=chatgpt.com)

这正好对应我们一直强调的：

> Role（角色）不能只是 Prompt。

---

## 它甚至已经设计好了非常好的 Ablation（消融实验）

TeamBench 比较：

```text
Solo
单 Agent

Restricted
受限单 Agent

Full Team
Planner + Executor + Verifier

No Plan
Executor + Verifier

No Verify
Planner + Executor
```

所以它能回答：

> Planner 到底贡献了什么？

以及：

> Verifier 到底贡献了什么？

而不是只比较：

```text
1 Agent
vs
3 Agent
``` :chatgpt-content-reference{index="6"}


---

## 更关键：它发现 Verifier 很可能是“假的”

TeamBench 有一个非常重要的实验结果：

> LLM Verifier（大模型验证者）会批准约 **49%** 实际被 Deterministic Grader（确定性评分器）判定为失败的结果。

也就是说：

```text
Verifier：
“PASS”

Script Judge：
FAIL
```

这直接支持我们刚才的 Judge 优先级：

```text
Deterministic Script
       >
Environment Judge
       >
LLM Judge
```

而不是：

```text
Reviewer Agent 说没问题
→ accepted
``` :chatgpt-content-reference{index="7"}


这个项目几乎可以直接成为我们 **P3 Independent Review（独立评审）** 实验的参考模板。

---

# 5. CooperBench：最适合证明“多 Agent 不一定更好”

CooperBench 是 Stanford + SAP 在 2026 年公开的多智能体代码协作 Benchmark。

它有：

- 652 个任务
- 12 个真实开源 Repository（代码库）
- Python / TypeScript / Go / Rust
- 确定性测试作为最终 Oracle（真值裁判）。:chatgpt-content-reference{index="8"}

它支持三种模式：

```text
solo
单 Agent 完成两个 Feature

coop
两个 Peer Agent，各自负责 Feature

team
Lead + Members
共享 Task List
Atomic Claim（原子任务认领）
Shared Scratchpad（共享工作区）
``` :chatgpt-content-reference{index="9"}


这里已经出现我们正在讨论的：

> Dynamic Claim（动态认领）

不过 CooperBench 的任务仍然主要由系统预先构造，并不是 Agensh 那种真正：

```text
Agent 自己发现未知 Work
→ 创建
→ Claim
```

因此它更准确是：

> **Shared Task Pool + Claim**

而不是完整：

> **Work Discovery + Dynamic Claim Pool**。

---

## 它的另一个价值是 Failure Taxonomy（失败分类）

CooperBench 将协同失败划分成：

- Expectation Failure（预期失败）
- Communication Failure（通信失败）
- Commitment Failure（承诺失败）

并发现即使增加通信，冲突会减少，但任务成功率不一定提高。[CooperBench](https://cooperbench.com/index.html?utm_source=chatgpt.com)

这意味着我们的 Eval 中应该增加：

```text
Coordination Failure Attribution
协作失败归因
```

不能只记录：

```text
FAIL
```

而应该记录：

```text
FAIL

→ Work Decomposition Error
→ Dependency Error
→ Claim Conflict
→ Communication Failure
→ Commitment Failure
→ Artifact Integration Failure
→ Acceptance Failure
→ Runtime Failure
```

---

# 6. AgentWorld：2026-09 最新，非常值得吸收一个指标

这个是我这次检索里认为最有新意的工作之一。

AgentWorld 发布于 **2026-09-25**，也就是非常近期。

它专门指出以前的多 Agent Benchmark 存在三个问题：

- Interaction 太短；
- 只是把多个 Agent 的能力加总；
- 没有真正测“合作”。

因此它设计了：

- 100 个人人工设计任务 + 100 个扩展变体
- 50+ 轮 Interaction（交互）
- 3～20 个 Agent
- 不对称 Role（角色）
- 不同能力
- Communication（通信）
- Joint Planning（联合规划）
- Resource Sharing（资源共享）。[arXiv](https://arxiv.org/abs/2609.31590?utm_source=chatgpt.com)

---

## 最值得我们的不是任务，而是 CCE

它提出：

> **Causal Collaboration Effectiveness，CCE（因果协作有效性）**

核心思想不是问：

> 一共有多少 Agent 做过事？

而是问：

> **哪些 Agent 的哪些行为，真正成为最终成功结果的因果链组成部分？** [arXiv](https://arxiv.org/abs/2609.31590?utm_source=chatgpt.com)


这和我们之前定义的：

```text
Useful Claim Ratio
```

以及：

```text
Evidence Utilization
```

其实指向同一个问题。

我们完全可以进一步形成：

```text
Useful Work Ratio
=
真正贡献最终 Accepted Artifact 的 Work Units
/
所有执行过的 Work Units
```

甚至构造：

```text
Goal
 ↓
Task A ─────┐
            ↓
Task B → Artifact
            ↓
Review ─────┤
            ↓
         Acceptance
```

最终反向追踪：

> 哪些 Task / Agent / Artifact 真正位于 Goal Success 的因果路径上。

这比：

```text
Agent Utilization = 80%
```

有意义得多。

---

# 7. AWS MACS：企业型多智能体 Benchmark

AWS Bedrock Agents 团队公开了：

> Multi-Agent Collaboration Scenario Benchmark（多智能体协作场景基准）。

包含：

- Travel Planning（旅行规划）
- Mortgage Financing（抵押贷款）
- Software Development（软件开发）

等企业场景。

每个 Case 主要包含：

```text
Scenario
Input Problem
Assertions
Agent Definitions
Tool Schemas
```

然后系统提交：

```text
Trajectories
Agent → Agent
Action
Observation
```

最终用 Assertion（断言）+ LLM Judge 做评分。[GitHub](https://github.com/aws-samples/multiagent-collab-scenario-benchmark?utm_source=chatgpt.com)

这个模型跟我们：

```text
Task Contract
→ Trace
→ Assertions
→ Judge
```

很接近。

但它规模和深度仍然没有达到 TeamBench / CooperBench 那么系统。

---

# 8. CollabBench：有价值，但不是我们的重点

2026 ICML 的 CollabBench 也专门研究 Collaboration（协作）。

但主要环境是：

- 多人协作游戏；
- 不同 Player Personality（玩家人格）；
- Reasoning（推理）；
- Communication（交流）；
- Action（行动）；
- Efficiency（效率）；
- Affective Adaptation（情感适应）。[arXiv](https://arxiv.org/abs/2606.05793?utm_source=chatgpt.com)

它更适合：

> Human-Agent Collaboration（人与智能体协作）

而不是我们现在研究的：

> Work Decomposition / Task Contract / Artifact / Acceptance。

所以暂时放到第二优先级。

---

# 9. 把这些 Bench 映射到我们的 P1～P6

这张表最关键。

| 我们的实验 | 现有最接近 Benchmark | 覆盖程度 |
|---|---|---|
| **P1 Central DAG** | MultiAgentBench | 🟡 部分 |
| **P2 Fan-out / Gather** | MultiAgentBench / MACS | 🟡 部分 |
| **P3 Independent Review** | **TeamBench** | 🟢 非常强 |
| **P4 Hierarchy** | MultiAgentBench + AgentWorld | 🟡 |
| **P5 Dynamic Claim Pool** | CooperBench Team Mode | 🟡 |
| **P6 DAG + Claim Pool** | **没有直接对应** | 🔴 |
| Work Contract | MACS / TeamBench 部分 | 🟡 |
| Artifact / Evidence | TeamBench / CooperBench | 🟡 |
| Acceptance Gate | **TeamBench** | 🟢 |
| Failure Recovery | 基本没有 | 🔴 |
| Durable State | 基本没有 | 🔴 |
| Work Discovery | AgentWorld/CooperBench 部分 | 🔴/🟡 |
| Claim Collision | CooperBench 部分 | 🟡 |
| Runtime Failure | 很少系统覆盖 | 🔴 |
| 跨 Runtime | MASEval 框架层支持比较 | 🟡 |
| Coordination Cost | CooperBench / AgentWorld | 🟢 |
| Causal Contribution | **AgentWorld CCE** | 🟢 |

所以答案其实非常明显：

> **现有 Bench 已经较好覆盖“Agent 能不能协作”；但没有完整覆盖“工作能不能被可靠地组织、执行、验证、恢复”。**

这正是我们比现有 Multi-Agent Bench 再往前走的一层。

---

# 10. 标准层：已经有人开始做，但还没有成熟标准

## IEEE P3777

这个需要重点跟踪。

名称：

> **Standard for Benchmarking and Performance Metrics of Artificial Intelligence Agents**

范围明确包括：

```text
Autonomous Agents
自主智能体

Collaborative Agents
协作智能体

Task-specific Agents
任务型智能体
```

并计划统一：

- Performance Metrics（性能指标）
- Evaluation Protocol（评测协议）
- Reporting Requirements（报告规范）
- Efficiency（效率）
- Robustness（鲁棒性）
- Adaptability（适应性）
- Ethical Compliance（伦理合规）
- Interoperability（互操作性）

而且特别强调：

> **wherever possible 使用 objective, binary evaluation measures（尽可能使用客观、二值的评价指标）。**

这与我们：

> Script Judge > LLM Judge

的原则高度一致。[IEEE标准协会](https://standards.ieee.org/ieee/3777/12350/?utm_source=chatgpt.com)

但状态仍然是：

> **Active PAR / Draft Development**

不是已发布正式标准。

---

# 11. NIST AI 800-2

NIST 2026 年开始制定：

> Practices for Automated Benchmark Evaluations of Language Models

其适用范围明确包括：

> AI models embedded in systems functioning as chatbots and AI agents。

它重点规范的是：

```text
Define Objective
定义评测目标

Select Benchmark
选择基准

Implement Protocol
实现协议

Run Evaluation
运行

Analyze Statistics
统计分析

Report
报告
```

以及：

- 可重复性；
- Benchmark 有效性；
- Evaluation Configuration；
- 结果如何解释；
- 不确定性；
- 报告透明度。[NIST](https://www.nist.gov/news-events/news/2026/01/towards-best-practices-automated-benchmark-evaluations?utm_source=chatgpt.com)

但它明确不是：

> 多智能体 Collaboration Standard（协同标准）。

而是：

> **怎么规范地做 Benchmark。**

所以特别适合作为我们未来实验的：

> **Meta Evaluation Protocol（元评测规范）**。

---

# 12. 我建议我们不要再“重新设计一个 Benchmark”

更好的策略已经很清楚：

```text
                我们的 MAS Eval
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
External Bench    Internal Cases   Reporting
外部基准           自有实验          评测规范
```

具体：

### 外部 Benchmark

直接采用：

```text
MultiAgentBench
→ Pattern / Topology

CooperBench
→ Coordination Conflict

TeamBench
→ Role / Review / Acceptance

AgentWorld
→ Long Horizon / Causal Contribution
```

### 自己补的 Cases

只补行业还没有解决好的：

```text
P1
Task Dependency DAG

P2
Fan-out Artifact Utilization

P5
True Work Discovery + Claim Pool

P6
DAG + Claim Hybrid

Work Contract

Artifact
Evidence
Acceptance

Durable Recovery

Runtime Migration
```

---

# 13. 我建议最终形成这样一个评测分层

这比我们上一轮的 Judge 体系又清晰了一步：

```text
MAS Evaluation System
│
├── E0 Benchmark Protocol
│     ├── NIST AI 800-2
│     └── IEEE P3777（跟踪）
│
├── E1 System Eval Harness
│     ├── Pi vitest-evals
│     └── MASEval 模型
│
├── E2 External Benchmarks
│     ├── MultiAgentBench
│     ├── CooperBench
│     ├── TeamBench
│     └── AgentWorld
│
├── E3 Our Work-System Bench
│     ├── DAG
│     ├── Fan-out
│     ├── Review
│     ├── Hierarchy
│     ├── Claim Pool
│     └── DAG + Claim
│
└── E4 Judges
      ├── Script Judge
      ├── Environment Judge
      ├── LLM Judge
      ├── Agent Judge
      └── Trace Judge
```

这里有一个很关键的变化：

> 我们不应该把自己的实验叫做“另一个 Multi-Agent Benchmark”。

更准确的定位可能是：

> **Agent Work System Benchmark（智能体工作系统基准）**

因为现有 Multi-AgentBench、CooperBench、TeamBench 更关注：

> **多个 Agent 是否能够合作。**

而我们进一步在问：

> **一个 Goal 能否形成正确 Work Structure；Work Unit 能否被分配、认领、执行、交接、验证、失败恢复，并且最终证明某种组织策略比强单智能体更值得使用。**

这两者不是一个层次。

### 当前最值得立即深入拆源码的三个

如果按我们的研究价值排序，我会先：

**① TeamBench → ② MASEval → ③ CooperBench。**

然后再研究 **AgentWorld 的 CCE（因果协作有效性）怎么吸收到我们的 Trace / Work Unit 模型里**。

这四个加起来，基本可以把我们上一轮自己设计的 70%～80% 评测思想找到现成实现参考；真正需要我们自己补的，主要会集中在 **Task Dependency DAG、Dynamic Claim Pool、DAG + Claim、Task Contract / Evidence / Acceptance、Durable Recovery** 这一条“工作系统”链上。
