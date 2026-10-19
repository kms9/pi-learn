# 本地验收记录模板

> 此文件仅是模板，不是已经通过的结果。请复制到本地（不要上传包含真实 Brain 名称、用户 ID 或 Note 原文的版本）。

- 日期：
- Mac / macOS：
- TheBrain Desktop 版本：
- Go 版本：
- API Origin（只记主机端口）：
- API Key：**已在本机配置 / 未配置**（不要复制内容）

| 检查 | 结果（PASS/FAIL） | HTTP 状态 | 脱敏证据 / Bug |
|---|---|---|---|
| doctor /app state | 未测 | | |
| brain list | 未测 | | |
| thought get | 未测 | | |
| thought graph | 未测 | | |
| note get | 未测 | | |
| search | 未测 | | |
| 禁止无效密钥 | 未测 | | |
| 禁止非 loopback Origin | 未测 | | |

## M2 写入闭环（必须是独立测试 Brain）

- 创建测试 Brain：
- create Thought：
- sourceThoughtId + relation：
- Graph 回读：
- Note update / append：
- JSON Patch：
- Link 方向：
- 重试幂等与意外断线恢复：

### Bug 与待确认契约

| 编号 | 输入/输出 schema 差异（脱敏） | 影响 | 修复/决策 |
| --- | --- | --- | --- |

最终阶段状态：**not-started / pass-mock / pass-local / blocked**。
