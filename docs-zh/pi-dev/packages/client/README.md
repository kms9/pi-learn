本文是 `README.md` 的中文阅读版；命令、路径、API 名称保持英文。

# @earendil-works/pi-client {#earendil-workspi-client}

面向实验性 Pi 服务协议的传输无关客户端。

```ts
import { Client, type ByteTransportFactory } from "@earendil-works/pi-client";

const transportFactory: ByteTransportFactory = async (handlers) => {
  // 使用 WebSocket、Unix socket 或其他有序字节传输进行连接。
  return {
    async send(chunk) {
      // 按调用顺序投递字节，并遵守背压。
    },
    close() {},
  };
};

const client = await Client.connect({
  serverId: "01234567-89ab-4def-8123-456789abcdef",
  transportFactory,
});
const result = await client.request(
  { serverId: client.hello.serverId },
  { serviceId: "example.service", member: "read", args: [] },
);
```

客户端会校验物理端点报告的逻辑 `serverId` 符合预期。服务器范围的请求携带该 ID，每个 Session 请求携带完整的 live target `{ serverId, sessionId, attachmentId }`。组合后的持久地址可防止跨服务器或跨会话误路由；服务器生成的 attachment ID 会在切换或重新 attach 之后拒绝延迟到达的 frame。

带类型的 server 与 Session API 由应用拥有的 Chord service binding 提供。`createClientServiceTransport()` 把延迟解析的 server 或 Session 路由适配为 Chord transport；`request()` 和 `subscribeService()` 仍是其底层原语。客户端使用 Chord 的 service-control parser 以及按订阅的 state decoder；`pi-protocol` 只校验路由 envelope 和 strict-JSON 边界。服务订阅返回完整的 provider snapshot；binding 安装它，然后调用 `start()` 以释放 hydrate 期间缓冲的更新。`Client` 按序应用带外 attachment 变更，但刻意不构造带类型的 service proxy，也不解释应用契约。

应用观察 API（例如 coding agent 的 `Transcript`）是普通的 Chord 服务。客户端不解释它们的 snapshot 或 update。

在断开或释放时，挂起的请求会在本地拒绝，但已被接受的工作仍可能在 attachment 释放之前于远端完成。客户端会清除其 live attachment 路由。它从不自动重连或重放请求。断开后，调用 `reconnect()`，再次通过应用的管理服务 attach，并且只显式重复已知安全的操作。

实验性本地 coordinator 只提供稳定端点并转发流量。可替换的 server 进程在公共客户端协议之外拥有 Session 与 worker 生命周期。

按如下方式调用 transport handler：

- `handlers.onData(chunk)` 用于入站字节；
- `handlers.onClose()` 用于有序的终端关闭；
- `handlers.onError(error)` 用于传输失败。

Transport factory 为每次尝试创建一条新的已认证连接。请求按 ID 关联，服务器失败以 `ServerError` 暴露。

## Unix domain socket {#unix-domain-sockets}

Node.js 和 Bun 的消费者可以使用单独的 Unix transport：

```ts
import { Client } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";

const client = new Client({
  serverId: "01234567-89ab-4def-8123-456789abcdef",
  transportFactory: createUnixTransportFactory({ path: "/tmp/pi.sock" }),
});
await client.connect();
```

Unix 发现会扫描显式的物理路由目录，从文件名推导每个预期的 server ID，并通过现有握手进行校验：

```ts
import { discoverUnixServers } from "@earendil-works/pi-client/unix";

const routes = await discoverUnixServers({ directory: "/run/user/1000/pi" });
// [{ serverId: "...", path: "/run/user/1000/pi/<serverId>.sock" }]
```

格式错误的条目、非 socket、过期或无响应的端点，以及 server-ID 不匹配都会被忽略。发现是只读的，最多并发探测 16 个 socket。意外的文件系统和 socket 错误会使发现失败。传入 `timeoutMs` 可覆盖默认探测超时。

`ClientOptions.maxFrameLength` 限制协议 payload。`maxPendingBytes` 限制排队的 Unix transport 输出。请在两端配置匹配的限制。
