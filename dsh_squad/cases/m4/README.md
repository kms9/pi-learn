# 案例：多小队协同（M4，DSH-M4-01～03）

- 小队 A（`team-a`）：author 写讲义，reviewer 审核。
- 小队 B（`team-b`）：editor 改稿，**同一个 reviewer 角色**审核（同一个 Bot「Reviewer」，在 B 的群里是另一个会话）。
- 小队 C（`team-c`）：maker 出题，auditor 审核；同时只做一件事（`max_parallel_tasks: 1`）；maker 把核对答案交给 auditor 作为子任务，等它回传后在同一次执行里接着完成。

三个 Run 同时开始时：A 和 C 立即开始；B 等 A 用完 reviewer 后原子地开始（FIFO）。

自动化脚本：`node probes/drive-m4.mjs`（mock 模型）。
