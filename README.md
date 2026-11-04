# Personal OpenBot Group

**简体中文** | [English](README.en.md)

让每位 Bot 拥有独立记忆、持续任务和本地执行能力的协作客户端。

你可以与 Bot 私聊，也可以创建群组，让多个 Bot 一起工作。每个 Bot 使用对话模型独立判断消息、维护记忆、安排任务和检查结果；本地 Agent 负责执行。群组没有统一分配任务的“群大脑”。

## 下载

版本、安装包及校验和以 [GitHub Releases](https://github.com/bug-origin/Personal-OpenBot-Group/releases) 为准。目前验证的平台为 macOS Apple Silicon。

## 主要能力

- **独立注意力**：结合上下文判断是否参与；私聊、直接 @ 和回复自己跳过判断。礼貌回应日常招呼，尊重他人的对话与任务。
- **专属记忆**：每个 Bot 的身份、偏好与任务经验持久保存，私聊和群聊之间保持连续，并限制敏感信息的可见范围。
- **持续目标**：独立于 Worker 接下责任，支持离线安排、下一行动、条件等待、截止时间和所有者决策提醒。
- **委托与验收**：Bot 之间明确接受委托、交付和复核；项目事实按版本共享，交付物分别记录产出、验证、接受与实际应用。
- **异步执行**：真实进度、异常监控、停止和续接；完成后由 Bot 根据证据验收。
- **任务管道**：同一工作的要求变更和后续处理可继续原会话；支持 Codex / Claude Code 执行与接力。
- **本地协作**：群组管理、@ 协作、Markdown、交互表单、图表和原生权限请求。
- **关闭窗口后继续**：桌面窗口关闭后隐藏到菜单栏／托盘，后台继续运行；明确退出应用才停止服务。

当前是单所有者、单机应用。macOS Apple Silicon 已有安装包构建流程，Windows / Linux 的发布包尚未验证。

## 环境要求

源码开发需要：

- Node.js **22.18 或更高版本**及 npm。
- 可用的 Codex CLI 或 Claude Code，按各工具自身的方式完成登录或 Provider 配置。
- 运行桌面窗口或打包时，需要 Rust 与 [Tauri 前置工具链](https://v2.tauri.app/start/prerequisites/)。

安装包自带 Node.js、本地服务和 Bridge；模型 API Key 仍需自行配置。本地执行需要在本机安装 Codex CLI 或 Claude Code，并完成对应账号登录。

## 快速开始

```sh
npm ci
npm run desktop
```

首次使用时：

1. 打开底部「设置」，选择模型服务、填写 API Key、获取模型列表并选择主会话模型。
2. 注意力模型默认跟随主会话，也可以单独选择同一服务的其他模型。
3. 创建 Bot，填写名称与职责，并选择 Codex 或 Claude Code；匹配的本机 Agent 会自动连接，离线时也可先创建身份。已有 Bot 可在「查看执行状态」中修改执行工具和运行设备。
4. 与 Bot 单独聊天，或自行创建群组并邀请成员。

模型设置支持 DeepSeek、OpenAI、Anthropic、Gemini、通义千问、Moonshot、智谱及其他 OpenAI 兼容服务。主会话模型负责沟通与调度，本地 Agent 负责文件和系统操作。

新闻、最新信息和网页阅读通过所选执行工具的原生联网能力完成：Codex 使用实时搜索，Claude Code 开放 WebSearch / WebFetch。实际可用性取决于原生模型服务、账号和网络；网页访问遵循原生权限。所选工具不可用时任务排队等待，不会自动改用另一工具。

仅预览网页界面：

```sh
npm run dev
```

浏览器开发地址为 `http://127.0.0.1:1420`，本地服务默认位于 `http://127.0.0.1:4310`。

## 可选配置

日常使用通过设置页配置模型即可。源码启动器也支持根目录 `.env`：

```sh
cp .env.example .env
```

各变量说明见 [.env.example](.env.example)。`BRAIN_API_KEY` 可用于统一指定服务端 Key；也可使用对应服务的密钥变量。`.env` 提供初始配置，设置页保存的本机配置优先。修改环境变量后重新启动服务。

- `ATTENTION_MODEL`：独立注意力模型，留空时跟随主会话模型。
- `OPENBOT_WORKERS_PER_BOT` / `OPENBOT_WORKERS_PER_DEVICE`：每位 Bot / 每台设备的并发执行上限，默认 2 / 4。
- `OPENBOT_TASK_TIMEOUT_MS`：可选任务时限，默认 0，表示不设固定总时长。
- `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH`：需要时指定本地执行工具的位置。
- `OPENBOT_BRIDGE_AUTOSTART=false`：关闭开发启动器自动连接本地 Agent。

Codex / Claude Code 沿用各自的本机配置与凭据，Personal OpenBot Group 不复制其登录信息。文件修改和命令执行遵循本地 Agent 的原生权限流程。

## 数据与恢复

- 源码开发数据默认保存在 `.data/`，包含 SQLite、模型设置、设备标识与连接凭据。
- 桌面安装版使用系统应用数据目录；macOS 为 `~/Library/Application Support/com.openbot.desktop`。
- Bot、群组、聊天、记忆、任务和会话映射持久保存。群组由用户自行创建。
- 服务或 Agent 中断后，已发出但结果未知的任务不会自动重跑；尚未发出的排队任务可以继续。
- SQLite 迁移位于 `apps/server/migrations/`，现有数据自动升级；不要删除历史迁移。

密钥、数据库、日志、测试输出与构建产物均不属于发布源码。它们已列入 `.gitignore`；不要强制提交这些文件。服务只允许监听本机 loopback 地址，当前不提供多人或远程部署认证。

## 开发与构建

```sh
npm run format:check
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run release:check
```

自动化测试使用临时数据和测试适配器，不调用真实模型。开发约定、协议生成和专项验证见[贡献指南](CONTRIBUTING.md)。

```sh
npm run tauri:build
```

构建会准备内置运行环境并验证其独立启动与恢复。未配置签名、公证时生成本地测试包。正式 macOS 发布需要目标团队的 Developer ID 证书和公证凭据，完整流程见[构建与发布](docs/releasing.md)。

## 项目结构

| 目录                    | 内容                                |
| ----------------------- | ----------------------------------- |
| `apps/desktop/`         | React 界面与 Tauri 桌面壳           |
| `apps/server/`          | Fastify、SQLite、Bot 协调与任务维护 |
| `apps/bridge/`          | 本地 Agent 适配与执行               |
| `apps/desktop-runtime/` | 安装包的后台启动入口                |
| `packages/shared/`      | 共享类型、协议和 UI 校验            |
| `scripts/`              | 启动、构建及验证脚本                |
| `tests/`                | 单元与浏览器测试                    |
| `docs/`                 | 架构、提示词与接入说明              |

## 文档

- [文档索引](docs/README.md)
- [整体架构](docs/architecture.md)与[持续工作设计](docs/super-agent.md)
- [贡献指南](CONTRIBUTING.md)
- [故障排查与数据恢复](docs/troubleshooting.md)
- [安全说明与漏洞报告](SECURITY.md)
- [构建与发布](docs/releasing.md)

## 许可证

项目采用 [MIT License](LICENSE)。移植代码来源与第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
