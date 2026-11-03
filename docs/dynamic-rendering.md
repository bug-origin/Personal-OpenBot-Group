# 群聊动态渲染

OpenBot 已移植 opsique-mono-harness desktop 的声明式渲染器，协议保持 `opsique-ui/0.1`。组件、状态绑定、条件显示、公式、动画和图表实现均保存在本项目，不依赖源项目运行。移植来源见 [PROVENANCE](../apps/desktop/src/renderer/PROVENANCE.md)。

## 使用

- 分工不明确且存在多个合适 Bot 时，群大脑可以显示「Bob 来做 / Alice 来做 / 两位都做」选择卡；明确指定两位时直接遵循，不重复询问。
- 对 Bot 说「给我一个可以填写的范围选择表单」，对话协调器可直接返回交互卡片。
- 每个 Bot 都默认知道动态渲染能力。需要收集信息、给出明确选项或展示数据时，可以主动使用卡片，无需用户说“表单”“图表”等关键词。聊天与执行 Bot 使用同一份能力说明。
- 执行 Bot 可返回完整协议 JSON，或使用 `opsique-ui` 代码围栏。合法文档渲染为该 Bot 自己的群聊消息，其他输出沿用文本消息；直接执行与对话协调两条路径都支持。
- 点击确认后，选择与填写内容成为普通用户消息，交给对应 Bot 继续处理。已提交卡片保留填写内容并变为只读。未提交草稿在本机当前客户端会话内保存，刷新可恢复。

模型与现有 DeepSeek 配置不变。独立执行会话与精简上下文的规则不变。

原生 Bot 在创建和恢复会话时，通过 `developerInstructions` 获得能力说明，用户指令仍只发送首次必要上下文或后续增量，不重复整段群聊。恢复旧会话也会更新能力说明。该接法已核对本机 Codex 生成的协议 Schema，生成方式见 [OpenAI Docs](https://learn.chatgpt.com/docs/app-server)。

## 接入点

- [Renderer](../apps/desktop/src/renderer/Renderer.tsx)：桌面渲染、组件目录和本地交互；沿用黑白灰主题。
- [共享引擎](../packages/shared/src/ui/engine.ts)：静态 Schema 校验、状态绑定与纯计算；模型输出不作为 HTML、JSX 或 JavaScript 执行。
- [UI 服务](../apps/server/src/ui.ts)：文档持久化、分工选项、服务端提交校验与幂等处理。
- [协议文档](../packages/shared/ui-contract/README.md)：完整组件与文档格式。修改协议后运行 `npm run generate:ui` 生成静态校验器。

已认证客户端通过 `POST /api/groups/:id/cards` 发布 `{botId, document, replyTo?}`；通过 `POST /api/cards/:messageId/actions` 提交协议 ActionEnvelope。

宿主只接受预定义的 `reply` 和服务端生成的 `choose_bots` 操作。提交时校验群组、成员、卡片版本、可见组件、实例、表单字段和原始绑定；不能由前端任意指定执行对象或命令。同一个请求重试只产生一条用户消息，旧版本和已处理卡片拒绝再次操作。填写状态与提交结果一同保存。

图表与 Mermaid 按需加载。地图保持源项目的关闭状态；图片遵循客户端现有内容安全策略。当前卡片操作用于回复与分工，不提供直接执行命令的动作。

## 验证

`npm test` 覆盖协议兼容、状态/公式、越权/篡改、版本、重复提交和原生输出接入。`npm run test:e2e` 覆盖真实表单操作、草稿恢复与窄屏布局。构建后运行 `node --import tsx scripts/smoke-ui.mjs`，使用隔离数据库和本地固定响应验证生产资源、严格 CSP、分工卡、表单和图表，不调用真实模型或修改日常数据。
