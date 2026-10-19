# TheBrain Local API：Mac 实机联通手册

> 本页中的命令需在**安装 TheBrain 的 Mac** 上执行。连接到 GitHub 的 ChatGPT 无权访问你的 Mac 的 localhost；本仓库的 mock 测试不能替代本地执行结果。

## 0. 前置条件

- TheBrain 桌面端已启动，并已登录；
- 当前版本启用了 Local API；
- 获取 `Settings > User > Local API Key`；
- macOS 终端已经装 Go 1.22+（`go version`）；
- 尽可能使用新建的测试 Brain（如 `TheBrain-API-Sandbox`），**不要直接在长期知识库做首次写入测试**。

## 1. 最短连通验证

在项目目录下执行：

```bash
export THEBRAIN_API_URL=http://127.0.0.1:11522
read -s "THEBRAIN_API_KEY?Local API Key: "; echo
export THEBRAIN_API_KEY
go run ./cmd/brainctl doctor
```

`brainctl doctor` 发出两次只读请求：

1. `GET /api/app/state`：核对桌面 App 和登录状态；
2. `GET /api/brains`：核对当前用户有权访问的 Brain 清单。

输出为 JSON；成功出现 `status: connected`，失败返回非零退出码和精简错误信息。严禁把实际 Local API Key 加入截图、Issue、PR、聊天或 shell 的共享脚本。

## 2. 手工核对路径（仅在 CLI 失败时）

```bash
curl --silent --show-error --max-time 5 --output /dev/null --write-out "HTTP %{http_code}\n"   -H "Authorization: Bearer ${THEBRAIN_API_KEY}"   "http://127.0.0.1:11522/api/app/state"
```

该命令只输出 HTTP 状态码，不能把机密响应上传到公共仓库。注意：CLI/`curl -H` 从环境变量取 Key，但作为进程参数传递时仍可能暴露给同机能查看进程的用户；正式运行建议只在受信任的个人 Mac 中进行，后续可改用 Keychain。

| 现象 | 原因方向 | 优先定位 |
| --- | --- | --- |
| `connection refused` / HTTP 000 | 桌面端未启动、服务没监听、端口不符 | 核实 TheBrain 设置与 `lsof -nP -iTCP:11522 -sTCP:LISTEN` |
| HTTP 401 | Key 缺失/无效 | 检查 Key 来源及变量是否有隐藏换行 |
| HTTP 403 | App Control 的 Key 与当前登录用户不一致 | 核对登录账号与 Local API Key |
| HTTP 404 | API URL/版本路径或 ID 错误 | Origin 不应带 `/api`；与原始 docs.json 比对 |
| 超时/连接中断 | 防火墙、代理、本机服务异常 | 固定使用回环地址，避免代理接管本机请求 |
| JSON 不符合预期 | API 与规范/版本差异 | 保存 **脱敏后的** version/HTTP/status/schema 摘要，不记录 Key |

## 3. 读闭环

```bash
go run ./cmd/brainctl brain list
go run ./cmd/brainctl app state
go run ./cmd/brainctl thought get --brain-id "BRAIN_UUID" --id "THOUGHT_UUID"
go run ./cmd/brainctl thought graph --brain-id "BRAIN_UUID" --id "THOUGHT_UUID"
go run ./cmd/brainctl note get --brain-id "BRAIN_UUID" --id "THOUGHT_UUID"
go run ./cmd/brainctl search --brain-id "BRAIN_UUID" --query "测试" --max-results 10
```

检查同一 `thoughtId` 在详情、Graph、Note 三处具有一致的身份；不要把搜索空结果视为不存在（可能存在索引延迟）。

## 4. 下一阶段：隔离 Brain 写闭环（待实现）

严格按以下顺序验证：创建测试 Brain → 新建 Parent Thought → sourceThoughtId + relation 新建 Child/Jump → Graph 回读 → Note update/append → Link 创建及方向 → JSON Patch → 上传附件 → 重试/中断恢复 → 清理测试对象。

每一步验收必须记录：
- 输入模型与版本（密钥不存档），HTTP method/path/status；
- response **字段结构**（允许脱敏 ID 与内容）；
- 可复现步骤、回读结果、是否需要等待搜索索引；
- 测试失败与逆操作/恢复结果；
- 待补充到 `docs/api/` 的已确认差异。

## 5. 反馈结果的最小格式

```text
macOS:
TheBrain 版本:
Go 版本:
Origin: http://127.0.0.1:11522
doctor: PASS/FAIL, HTTP status（不要贴 Key）
brain list: PASS/FAIL
thought get / graph / notes / search: PASS/FAIL
测试 Brain: 已创建 / 待创建（不需上传真实 ID）
差异与错误: 截取脱敏消息
```

别公开截图中的 Notes 正文、User ID、个人 Brain 名称、账号信息。
