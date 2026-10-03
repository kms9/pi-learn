# Pi Squad 插件检查

检查这个插件时，先把进程摆开再看，不要先写验收脚本。

## 必须

1. 每次新开始检查前，先关掉当前 Herdr 会话里上次留下的测试 workspace（space）。没有则跳过。只关测试 space，不关正在写代码的 workspace，也不关用户已有服务所在的 space。然后新开一个测试 space。不要塞进正在写代码的 workspace，也不要用外部 tmux 或本会话后台 shell。
2. 至少启动三个不同角色的 Pi，每个角色一个终端。三个节点指的是三个角色，不是把 Controller、单个 Pi 和 Dashboard 凑成三个终端。这些 Pi 的启动 cwd 必须是当前要检查的项目目录，角色只读该目录下的 `.agents/roles/<role_id>/role.md`。不要把正常角色复制到 `/tmp` 再启动，否则 whoami 的 cwd、role_dir 对不上仓库里的配置。
3. Controller `serve` 单独一个终端。Dashboard 也单独一个终端，运行 `tui --url http://<该 serve 的监听地址>`。不要往 serve 终端的 stdin 输入 `tui`。`q` 只退出面板，不停止服务。Controller 可以用独立端口和临时数据库，避免写到用户已有服务；这不改变 Pi 的 cwd。

阶段 04（4a 的 M1）落地后，角色路径改为 `.agents/pisquad/roles/<role_id>/{role.md,agents.md}`，启动变量改为 `PI_SQUAD_MODE`、`PI_SQUAD_AGENT_ID` 及 `PI_SQUAD_TEAM_ID` / `PI_SQUAD_ROLE_ID`，Controller 改为动态端口加 discovery 文件（见 `pi_squad_case/04-team-orchestration/`）。落地前按下面的现有路径检查。

## 上次实际开法

2026-09-24 的可见检查是这样做的：

- Controller 一个终端：`go run ./cmd/controller --listen 127.0.0.1:<端口> --db <临时库>`。
- 每个角色一个 Pi 终端，cwd 为当前项目目录，`PI_SQUAD_CONTROLLER_URL` 指向这个端口。扩展未安装时用 `pi --no-extensions -e pi_squad/extension/index.ts`。角色至少三个，且 `PI_SQUAD_ROLE_ID` 各不相同，对应 `.agents/roles/<role_id>/role.md`。
- Dashboard 另一个终端：`cd pi_squad/controller && go run ./cmd/controller tui --url http://127.0.0.1:<同一端口>`。
- 直接看 pane：启动日志、`/squad-whoami`、注册行、面板上的在线记录。

不停止、不重启、不往用户已经在跑的 Controller 或 Pi 写数据。Controller 要隔离时用新端口和临时数据库。正常 Pi 仍从当前项目目录启动。只有会破坏该目录角色加载的负例（例如旧平铺 `reviewer.md`）才放到单独临时目录，并在 pane 上标明这是预期拒绝，不要和正常角色混在同一 cwd。

## 验收执行者

默认由当前会话执行验收；跨 Agent 协作遵循根目录 `AGENTS.md`，不沿用历史交接中的执行者分工、回传目标或发送授权。
