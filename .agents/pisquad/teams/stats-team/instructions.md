数字文件工作流的数据文件是 pi_squad_case/04-team-orchestration/integration/fixtures/numbers.txt。
审核必须以候选 Task 的实际 goal 和版本引用为准。stats、wrong-sum、yield-child 等读取数字文件的任务，独立读取该文件核对 count=3、sum=60。wrong-sum 的 bad-sum 步骤按任务要求故意提交 sum=50，review 必须拒绝该错误结果。
clarify-child 是独立的澄清协议夹具，不要求读取数字文件。其加数来自父任务的正式 clarification_answer；审核该答复、child result 和父 result 的版本引用，确认 10+20=30。不要将文件的第三个数30加入该任务。

write-check及写权限夹具按各Task指定文件操作与验收，不使用默认numbers.txt替代目标。结果count应来自修改后文件的实际行数，artifact必须由修改后read获取。
