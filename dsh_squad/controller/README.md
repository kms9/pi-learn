# DSH Squad Controller

Go 控制面：Team、Run、Task、Attempt、DAG、Review、Acceptance、恢复与事件。开发约束在 [AGENTS.md](AGENTS.md)。2026-10-19 从 `pi_squad/controller` 迁来（D1），只支持宿主 `dsh/0.2.1-rc.2+ds-bot/ae63b45`，协议 `squad/3`（[契约](../protocol/README.md)）。

## 运行

项目目录下要有 `.agents/dshsquad/roles/<role>/{role.md,agents.md}` 和 `.agents/dshsquad/teams/<team>/{team.json,instructions.md}`。

```bash
cd dsh_squad/controller
go run ./cmd/controller serve --project-root /path/to/project
```

`serve` 持项目锁，数据库默认在 `.agents/dshsquad/.runtime/state.sqlite`，监听 `127.0.0.1:0`，把 endpoint 和 controller_id 写进 `.agents/dshsquad/.runtime/controller.json`；operator 凭据在同目录的私有文件里。

```bash
go run ./cmd/controller doctor --project-root /path/to/project --dsh-binary dsh --ds-bot-dir ../.build/ds-bot
```

`doctor` 检查项目配置、DSH 版本和打了 seam 补丁的 ds-bot。

## 与宿主的关系

DSH 宿主里的 Adapter（`dsh_squad/adapter`）为每个受控的（Bot, 位置）各注册一个 runtime，拉取派发、注入准入、上报 AttemptEvent。Controller 不启动宿主。

## 检查

```bash
dsh_squad/scripts/check.sh
```
