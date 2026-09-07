本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/pi-server {#earendil-workspi-server}

面向新的持久 Session 与 Agent Harness 接口的实验性本地服务器。

当前切片支持 server 与 Session 作用域的 facet-service 路由，以及多 presentation attachment。`RoutedServerServiceHost.attachClient()` 创建一条连接作用域的 server service endpoint，能力仅限于狭窄的 attachment 管理。`RoutedSessionHandle.attachClient()` 返回 presentation 作用域的 Session 能力。它的 `invokeService()` 把不透明的 service/member envelope 转发到所选 Session endpoint；服务器校验 attachment 路由，但不加载 facet 契约。

- server 服务调用和订阅通过连接的 `RoutedServerServiceAttachment` 不透明路由；
- 应用拥有的 `SessionDirectory` 把私有目录投影为可复制的、对 presentation 安全的状态；
- 应用拥有的 `SessionManagement` 创建、删除、attach 和 detach Session，而不在业务结果中暴露路由 ID；
- 路由器安装或清除 live route 之后，attachment 变更带外发布；
- Session 服务调用通过 `invokeService` 路由，不做服务器侧的业务 payload 解码；
- 服务订阅更新仍限定在发起请求的 attachment；
- 应用观察（例如 transcript）作为普通服务状态路由，没有服务器拥有的业务 schema。

一个 Session 可以有多个 presentation attachment。从同一连接重复 `attach` 是幂等的；每次成功的 attachment 都有一个服务器生成的 `attachmentId`，仅作为路由控制数据投递。Session 请求携带 `{ serverId, sessionId, attachmentId }`，服务器拒绝过期或不匹配的路由。丢失连接会拒绝其本地响应，但只有在已准入的服务调用结算后才释放其 attachment。Host 决定何时在零 presentation 需求以及 worker 本地 Harness 活动允许时退役 worker。服务器关闭会关闭每个已路由的 Session handle，释放其 worker 与 Session writer 所有权。

```ts
import { randomUUID } from "node:crypto";
import { MemorySessionRepo, type Session } from "@earendil-works/pi-agent-core";
import {
  type RoutedServerServiceHost,
  type RoutedSessionHandle,
  type ServerHost,
  SessionAmbiguousError,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixServer, getUnixSocketPath } from "@earendil-works/pi-server/unix";

async function startServer(
  serverServices: RoutedServerServiceHost,
  openRoutedSession: (session: Session) => Promise<RoutedSessionHandle>,
) {
  const sessions = new MemorySessionRepo();
  const host: ServerHost = {
    serverServices,
    async resolveSession(sessionId, context) {
      const matches = (await sessions.list(undefined, context))
        .filter((metadata) => metadata.id === sessionId);
      if (matches.length === 0) {
        throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
      }
      if (matches.length > 1) throw new SessionAmbiguousError();
      return matches[0];
    },
    async openSession(metadata, context) {
      const session = await sessions.open(metadata, context);
      try {
        return await openRoutedSession(session);
      } catch (error) {
        try {
          await session.close(context);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Harness creation and Session cleanup failed",
          );
        }
        throw error;
      }
    },
  };

  const serverId = randomUUID();
  const server = createUnixServer(host, {
    serverId,
    path: getUnixSocketPath(serverId, "/run/user/1000/pi"),
  });
  await server.start();
  return server;
}
```

应用提供必需的 server service host、有界的 Session resolver，以及 routed Session factory。Session 发现与管理是应用拥有的服务；协议服务器只在路由 attachment 时向 resolver 询问 metadata。Host 拥有获取 worker 本地 Session 与 Harness 的职责。失败会在该 worker 中清理。打开的 JavaScript Session 和 Harness 都不会跨越进程边界。

`serverId` 是启动器提供的逻辑身份，不是 socket 地址。Unix preset 需要显式的物理 `path`；`getUnixSocketPath()` 从调用方选定的目录推导路径。请选择短的、私有的运行时目录，而不是从无界的 home 目录路径推导路由。长期运行的启动器在替换 server 进程时可以复用同一 ID 和 path。

`Server` 通过 `ServerListener` 组合 transport；peer 认证仍是应用策略，实验性 Unix transport 并未实现。Unix 子模块提供 `createUnixListener()` 和 `createUnixServer()`。底层 routed-envelope 校验、CBOR 和 framing 来自 `@earendil-works/pi-protocol`；Chord 拥有 service-control 解析、错误码、snapshot 与 update，以及每个订阅的 replicated-state encoder。

Server 与 worker 生命周期在公共 Pi 协议之外管理。可替换的应用服务器把连接 attachment 转换成私有需求更新；worker 把带 generation 标记的需求与权威 Harness 活动结合。实验性 coordinator 只提供稳定路由，并报告通用的 server-generation 连接变更。
