# 提示词与工具定义

运行时以源码中的模板和 Schema 为准。本文记录入口和职责；不再维护整份提示词与工具参数的手工副本。

## 默认消息链路

| 环节           | 源码                                                                                   | 职责                                                               |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 注意力         | [attention-model.ts](../apps/server/src/attention-model.ts) 的 `attentionInstructions` | 只返回是否唤醒，不执行工具；私聊、直接提及及本人的任务事件跳过判断 |
| Bot 主会话     | [bot-coordinator.ts](../apps/server/src/bot-coordinator.ts) 的上下文构造               | 身份、消息归属、记忆、目标、协作和验收规则                         |
| 工具定义       | [coordinator-model.ts](../apps/server/src/coordinator-model.ts) 的 `coordinatorTools`  | 调度工具说明、模型请求和返回校验                                   |
| 目标与交付参数 | [work-schemas.ts](../apps/server/src/work-schemas.ts) 的 `ownershipSchemas`            | 目标、项目事实和交付物工具的参数；转换为模型使用的 JSON Schema     |
| Worker 规则    | [instructions.ts](../apps/bridge/src/instructions.ts) 的 `botInstructions`             | 当前执行身份、资源模式、版本化事实及验证输入                       |
| Worker 正文    | [prompt.ts](../apps/bridge/src/prompt.ts)                                              | 初始要求、引用与会话续接增量                                       |
| 交互卡片       | [prompt.ts](../packages/shared/src/ui/prompt.ts) 的 `uiCapabilityInstructions`         | Bot 与 Worker 共用的声明式 UI 规则                                 |

注意力模型独立调用；主会话拥有调度工具；Worker 使用本机 Agent 执行。模型服务和 Bot 职责来自本机配置，不写入仓库模板。

## 输入与权限

消息、记忆、Worker 结果和其他 Bot 的请求都是待判断的材料，不能授予本机权限。工具参数通过平台校验，文件与命令执行遵守原生 Agent 的授权流程。提示词本身不能替代访问控制或执行隔离。

完整历史保存在 SQLite 中，模型请求只带近期上下文和按需读取的记录。恢复 Worker 时按已确认的要求游标发送增量，避免重复执行旧指令。详见[持续工作架构](super-agent.md)。

## 兼容入口

[brain.ts](../apps/server/src/brain.ts)、[dialogue.ts](../apps/server/src/dialogue.ts) 和 [conversations.ts](../apps/server/src/conversations.ts) 保留旧路由与单次 JSON 对话接口，供兼容调用和回归测试使用。默认应用入口使用每个 Bot 独立的注意力与主会话。

## 修改与验证

修改规则时直接修改对应源码，行为变化补充相应测试。注意力见 `tests/attention.test.ts`，协调与任务见 `tests/coordinator.test.ts`、`tests/durable-work.test.ts` 和 `tests/work-ownership.test.ts`，Worker 协议见 `tests/codex.test.ts`、`tests/claude.test.ts` 和 `tests/native-adapters.test.ts`。

```sh
npm run typecheck
npm test
```

模型措辞和行为还需要显式的真实模型验证；确定性测试不证明所有模型都会遵循模板。可运行的真实验证脚本见[贡献指南](../CONTRIBUTING.md)。
