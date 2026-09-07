本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/pi-session-backend-sqlite-node {#earendil-workspi-session-backend-sqlite-node}

面向 `@earendil-works/pi-agent-core` 的 Node `node:sqlite` Session backend。

```ts
import { BACKGROUND_CONTEXT } from "@earendil-works/pi-agent-core";
import {
  createNodeSqliteFactory,
  SqliteSessionRepo,
} from "@earendil-works/pi-session-backend-sqlite-node";

const repository = new SqliteSessionRepo({
  directory: "/var/lib/pi/sessions",
  databaseFactory: createNodeSqliteFactory(),
});

const session = await repository.create({}, BACKGROUND_CONTEXT);
const main = await session.createBranch("main", null, BACKGROUND_CONTEXT);
await main.appendMessage(
  { role: "user", content: "hello", timestamp: Date.now() },
  BACKGROUND_CONTEXT,
);
await session.close(BACKGROUND_CONTEXT);
await repository.close(BACKGROUND_CONTEXT);
```

默认布局在 `directory` 下为每个 Session 创建一个文件。仅包含 ASCII 字母、数字、`_` 和 `-` 的 ID 保留 `{sessionId}.sqlite`；其他每个 ID 使用其 UTF-16 码元的、以 `~` 为前缀的 base64url 编码。持久 ID 不变，返回/列出的 metadata 包含规范物理路径。传入 `databasePath` 可以把多个 Session 放到一个受支持的共享容器中；需要时会创建其父目录。

数据库 factory 区分有意创建、不创建的读写打开，以及不创建的只读打开。Session `open()` 和删除会拒绝配置仓库之外的 metadata，并且从不创建缺失的数据库。列出是只读的，且尽力而为。Fork 有意允许外来的源 metadata 路径：它只读打开该精确存在的容器，从不把同一 ID 的活跃本地 Session 替换进去。

Host 生命周期（而不是本 backend）保证每个 Session 只有一个可写所有者。在另一进程中直接为写入打开同一 Session 不受支持。仓库拒绝同一 ID 上重叠的本地 create/open/fork/delete 所有权，但不实现跨进程 lease、lock、fence、heartbeat 或 takeover。Host 必须在删除前关闭 worker。

对同一仓库中已打开源的 fork，会把它的 snapshot 排到该源的 commit 队列上。任何其他源（包括被活着的 Session worker 持有打开的源）使用独立的只读连接和一次延迟的 WAL 事务；在该 snapshot 仍打开时，后续 worker commit 仍可能完成。共享容器删除只移除所选 Session 的行。仓库 close 会等待每一次打开的 Session 清理尝试，然后才报告错误。本包不导出搜索服务或 FTS 索引；搜索是单独的 S3 projection。
