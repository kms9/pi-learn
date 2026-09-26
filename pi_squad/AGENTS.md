# Pi Squad 插件检查

检查这个插件时，先把进程摆开再看，不要先写验收脚本。

## 必须

1. 每次新开始检查前，先关掉当前 Herdr 会话里上次留下的测试 workspace（space）。没有则跳过。只关测试 space，不关正在写代码的 workspace，也不关用户已有服务所在的 space。然后新开一个测试 space。不要塞进正在写代码的 workspace，也不要用外部 tmux 或本会话后台 shell。
2. 至少启动三个不同角色的 Pi，每个角色一个终端。三个节点指的是三个角色，不是把 Controller、单个 Pi 和 Dashboard 凑成三个终端。这些 Pi 的启动 cwd 必须是当前要检查的项目目录，角色只读该目录下的 `.agents/roles/<role_id>/role.md`。不要把正常角色复制到 `/tmp` 再启动，否则 whoami 的 cwd、role_dir 对不上仓库里的配置。
3. Controller `serve` 单独一个终端。Dashboard 也单独一个终端，运行 `tui --url http://<该 serve 的监听地址>`。不要往 serve 终端的 stdin 输入 `tui`。`q` 只退出面板，不停止服务。Controller 可以用独立端口和临时数据库，避免写到用户已有服务；这不改变 Pi 的 cwd。

## 上次实际开法

2026-09-24 的可见检查是这样做的：

- Controller 一个终端：`go run ./cmd/controller --listen 127.0.0.1:<端口> --db <临时库>`。
- 每个角色一个 Pi 终端，cwd 为当前项目目录，`PI_SQUAD_CONTROLLER_URL` 指向这个端口。扩展未安装时用 `pi --no-extensions -e pi_squad/extension/index.ts`。角色至少三个，且 `PI_SQUAD_ROLE_ID` 各不相同，对应 `.agents/roles/<role_id>/role.md`。
- Dashboard 另一个终端：`cd pi_squad/controller && go run ./cmd/controller tui --url http://127.0.0.1:<同一端口>`。
- 直接看 pane：启动日志、`/squad-whoami`、注册行、面板上的在线记录。

检查用的 Claude pane 留在该 space 外面。不停止、不重启、不往用户已经在跑的 Controller 或 Pi 写数据。Controller 要隔离时用新端口和临时数据库。正常 Pi 仍从当前项目目录启动。只有会破坏该目录角色加载的负例（例如旧平铺 `reviewer.md`）才放到单独临时目录，并在 pane 上标明这是预期拒绝，不要和正常角色混在同一 cwd。


## 验收回传

派发者每次用 `herdr pane current --current` 读取自己的实时位置，交接消息和当前阶段 `HANDOFF.md` 同时记录以下 YAML 字段：

```yaml
handoff_id: <本次唯一任务标识>
callback_pane_id: <派发者当前 pane_id>
callback_terminal_id: <派发者 terminal_id>
callback_agent_kind: codex
report_path: <仓库内验收报告路径>
```

- pane ID 不硬编码为永久配置。派发者移动时，需将新地址同步给验收方。terminal_id 用于确认是同一终端，不能作为 agent prompt 的目标参数。
- 验收方在完成检查或遇到明确阻塞并结束本轮前，先保存报告，再主动回传一次；仍有 NOT_RUN 时必须写明原因，不能声称阶段通过。
- 回传前使用 Herdr 技能：确认 HERDR_ENV=1，核对 `herdr agent get <callback_pane_id>` 的 terminal_id 和 agent 种类。位置失效时可用 `herdr agent list` 按同一 terminal_id 找新 pane；找不到或身份不符时不得猜测目标，在报告记 callback_pending 和原因。
- 使用 `herdr agent prompt <实际回传 pane_id> <结果摘要>`，不加 `--wait`，防止双方互等。参数用结构化调用或 Python subprocess 参数列表传入，避免拼接未经转义的 shell 文本。
- 摘要包含：`message_type=acceptance_result`、handoff_id、PASS/PARTIAL/FAIL/BLOCKED、已测项、失败复现、未测项及原因、报告路径、测试 workspace/pane。不得包含 runtime_token 等凭据。
- `agent_prompted` 只说明已提交，不能写成对方已经阅读；回传状态记录为 submitted。若提交结果不明，先查看目标状态/输出，不盲目重复发送。
- 派发者按 handoff_id 识别结果，读取报告再判断下一步；结果消息只回传一次，不再自动发送“收到”的回调，避免循环通知。

本约定用于开发者与 Claude 的 Herdr 验收协作，不是 Pi Squad Agent 消息协议，也不写入 `.agents/roles/` 的角色配置。
