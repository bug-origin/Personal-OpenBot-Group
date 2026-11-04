# Personal OpenBot Group

让每位 Bot 拥有独立记忆、持续任务和本地执行能力的协作客户端。

A collaborative desktop client where every digital employee has its own memory, ongoing tasks, and local execution capabilities.

你可以与 Bot 私聊，也可以创建群组，让多个 Bot 一起工作。每个 Bot 使用对话模型独立判断消息、维护记忆、安排任务和检查结果；本地 Agent 负责执行。群组没有统一分配任务的“群大脑”。

Chat with a Bot one-on-one, or create a group where multiple Bots work together. Each Bot uses a conversational model to independently interpret messages, maintain memory, plan tasks, and review results. A local Agent handles execution. Groups do not have a central “group brain” that assigns work.

## 下载 / Download

版本、安装包及校验和以 [GitHub Releases](https://github.com/bug-origin/Personal-OpenBot-Group/releases) 为准。目前验证的平台为 macOS Apple Silicon。

See [GitHub Releases](https://github.com/bug-origin/Personal-OpenBot-Group/releases) for versions, installers, and checksums. macOS Apple Silicon is the currently verified platform.

## 主要能力 / Key Features

- **独立注意力 / Independent attention**：结合上下文判断是否参与；私聊、直接 @ 和回复自己跳过判断。礼貌回应日常招呼，尊重他人的对话与任务。<br>
  Bots use context to decide whether to participate. They skip this check in one-on-one chats, when directly @mentioned, and when replying to themselves. They respond politely to greetings and respect other people’s conversations and tasks.
- **专属记忆 / Personal memory**：每个 Bot 的身份、偏好与任务经验持久保存，私聊和群聊之间保持连续，并限制敏感信息的可见范围。<br>
  Each Bot’s identity, preferences, and task experience are saved persistently and carry across one-on-one and group chats, while access to sensitive information remains limited.
- **持续目标 / Ongoing goals**：独立于 Worker 接下责任，支持离线安排、下一行动、条件等待、截止时间和所有者决策提醒。<br>
  Goals persist independently of Workers and support offline planning, next actions, waiting for conditions, deadlines, and reminders when an owner’s decision is needed.
- **委托与验收 / Delegation and review**：Bot 之间明确接受委托、交付和复核；项目事实按版本共享，交付物分别记录产出、验证、接受与实际应用。<br>
  Bots explicitly accept, deliver, and review delegated work. Project facts are shared with versioning, and deliverables separately track their creation, verification, acceptance, and actual use.
- **异步执行 / Asynchronous execution**：真实进度、异常监控、停止和续接；完成后由 Bot 根据证据验收。<br>
  Track real progress, monitor for issues, stop or resume execution, and have the Bot review the evidence when work is complete.
- **任务管道 / Task pipeline**：同一工作的要求变更和后续处理可继续原会话；支持 Codex / Claude Code 执行与接力。<br>
  Requirement changes and follow-up work can continue in the original session. Codex and Claude Code execution and handoffs are supported.
- **本地协作 / Local collaboration**：群组管理、@ 协作、Markdown、交互表单、图表和原生权限请求。<br>
  Manage groups and @mentions, and use Markdown, interactive forms, charts, and native permission requests.
- **关闭窗口后继续 / Keep running when the window closes**：桌面窗口关闭后隐藏到菜单栏／托盘，后台继续运行；明确退出应用才停止服务。<br>
  Closing the desktop window hides the app in the menu bar or system tray while it continues running in the background. Services stop only when you quit the app.

当前是单所有者、单机应用。macOS Apple Silicon 已有安装包构建流程，Windows / Linux 的发布包尚未验证。

Personal OpenBot Group currently supports one owner on one computer. An installer build process is available for macOS Apple Silicon; Windows and Linux release packages have not yet been verified.

## 环境要求 / Requirements

源码开发需要：

For source development, you need:

- Node.js **22.18 或更高版本**及 npm。<br>
  Node.js **22.18 or later** and npm.
- 可用的 Codex CLI 或 Claude Code，按各工具自身的方式完成登录或 Provider 配置。<br>
  The Codex CLI or Claude Code, signed in or configured with a provider as required by that tool.
- 运行桌面窗口或打包时，需要 Rust 与 [Tauri 前置工具链](https://v2.tauri.app/start/prerequisites/)。<br>
  Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) to run the desktop window or build an installer.

安装包自带 Node.js、本地服务和 Bridge；模型 API Key 仍需自行配置。本地执行需要在本机安装 Codex CLI 或 Claude Code，并完成对应账号登录。

Installers include Node.js, the local service, and the Bridge. You still need to configure a model API key. Local execution requires Codex CLI or Claude Code to be installed and signed in on your computer.

## 快速开始 / Quick Start

```sh
npm ci
npm run desktop
```

首次使用时：

On first launch:

1. 打开底部「设置」，选择模型服务、填写 API Key、获取模型列表并选择主会话模型。<br>
   Open **Settings** at the bottom, choose a model provider, enter an API key, load the model list, and select the primary conversation model.
2. 注意力模型默认跟随主会话，也可以单独选择同一服务的其他模型。<br>
   The attention model follows the primary conversation model by default. You can also select another model from the same provider.
3. 创建 Bot，填写名称与职责，并选择 Codex 或 Claude Code；匹配的本机 Agent 会自动连接，离线时也可先创建身份。已有 Bot可在「查看执行状态」中修改执行工具和运行设备。<br>
   Create a digital employee, enter its name and responsibilities, and choose Codex or Claude Code. A matching local Agent connects automatically; you can also create the identity while the Agent is offline. For an existing employee, change the execution tool and device under **View execution status**.
4. 与 Bot 单独聊天，或自行创建群组并邀请成员。<br>
   Chat with a digital employee one-on-one, or create a group and invite members.

模型设置支持 DeepSeek、OpenAI、Anthropic、Gemini、通义千问、Moonshot、智谱及其他 OpenAI 兼容服务。主会话模型负责沟通与调度，本地 Agent 负责文件和系统操作。

Model settings support DeepSeek, OpenAI, Anthropic, Gemini, Qwen, Moonshot, Zhipu AI, and other OpenAI-compatible services. The primary conversation model handles communication and orchestration; the local Agent handles file and system operations.

新闻、最新信息和网页阅读通过所选执行工具的原生联网能力完成：Codex 使用实时搜索，Claude Code 开放 WebSearch / WebFetch。实际可用性取决于原生模型服务、账号和网络；网页访问遵循原生权限。所选工具不可用时任务排队等待，不会自动改用另一工具。

News, up-to-date information, and web reading use the selected execution tool’s built-in web capabilities: Codex uses live search, and Claude Code provides WebSearch / WebFetch. Availability depends on the model service, account, and network. Web access follows each tool’s native permissions. If the selected tool is unavailable, tasks wait in the queue; they do not automatically switch to another tool.

仅预览网页界面：

To preview only the web interface:

```sh
npm run dev
```

浏览器开发地址为 `http://127.0.0.1:1420`，本地服务默认位于 `http://127.0.0.1:4310`。

The browser development URL is `http://127.0.0.1:1420`. The local service runs at `http://127.0.0.1:4310` by default.

## 可选配置 / Optional Configuration

日常使用通过设置页配置模型即可。源码启动器也支持根目录 `.env`：

For regular use, configure models in Settings. When launching from source, you can also use a root-level `.env` file:

```sh
cp .env.example .env
```

各变量说明见 [.env.example](.env.example)。`BRAIN_API_KEY` 可用于统一指定服务端 Key；也可使用对应服务的密钥变量。`.env` 提供初始配置，设置页保存的本机配置优先。修改环境变量后重新启动服务。

See [.env.example](.env.example) for descriptions of each variable. Use `BRAIN_API_KEY` to set a shared server-side key, or use the key variable for a specific provider. The `.env` file supplies initial settings; settings saved on this device take precedence. Restart the service after changing environment variables.

- `ATTENTION_MODEL`：独立注意力模型，留空时跟随主会话模型。<br>
  Separate attention model; leave blank to follow the primary conversation model.
- `OPENBOT_WORKERS_PER_BOT` / `OPENBOT_WORKERS_PER_DEVICE`：每位 Bot / 每台设备的并发执行上限，默认 2 / 4。<br>
  Maximum concurrent executions per Bot / per device; defaults to 2 / 4.
- `OPENBOT_TASK_TIMEOUT_MS`：可选任务时限，默认 0，表示不设固定总时长。<br>
  Optional task timeout; defaults to 0, meaning no fixed overall time limit.
- `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH`：需要时指定本地执行工具的位置。<br>
  Paths to local execution tools, if you need to specify them.
- `OPENBOT_BRIDGE_AUTOSTART=false`：关闭开发启动器自动连接本地 Agent。<br>
  Disables automatic connection to the local Agent from the development launcher.

Codex / Claude Code 沿用各自的本机配置与凭据，Personal OpenBot Group 不复制其登录信息。文件修改和命令执行遵循本地 Agent 的原生权限流程。

Codex and Claude Code use their own local settings and credentials; Personal OpenBot Group does not copy their sign-in information. File changes and command execution follow the local Agent’s native permission flow.

## 数据与恢复 / Data and Recovery

- 源码开发数据默认保存在 `.data/`，包含 SQLite、模型设置、设备标识与连接凭据。<br>
  Source-development data is stored in `.data/` by default, including SQLite, model settings, device identity, and connection credentials.
- 桌面安装版使用系统应用数据目录；macOS 为 `~/Library/Application Support/com.openbot.desktop`。<br>
  The desktop installer uses the system application data directory. On macOS, this is `~/Library/Application Support/com.openbot.desktop`.
- Bot、群组、聊天、记忆、任务和会话映射持久保存。群组由用户自行创建。<br>
  Bots, groups, chats, memories, tasks, and session mappings are saved persistently. Users create groups themselves.
- 服务或 Agent 中断后，已发出但结果未知的任务不会自动重跑；尚未发出的排队任务可以继续。<br>
  If a service or Agent is interrupted, tasks already sent with unknown results are not automatically rerun. Queued tasks that have not yet been sent can continue.
- SQLite 迁移位于 `apps/server/migrations/`，现有数据自动升级；不要删除历史迁移。<br>
  SQLite migrations are in `apps/server/migrations/`; existing data is upgraded automatically. Do not delete historical migrations.

密钥、数据库、日志、测试输出与构建产物均不属于发布源码。它们已列入 `.gitignore`；不要强制提交这些文件。服务只允许监听本机 loopback 地址，当前不提供多人或远程部署认证。

Keys, databases, logs, test output, and build artifacts are not part of the release source. They are listed in `.gitignore`; do not force-add them. The service listens only on the local loopback address and currently does not provide authentication for multi-user or remote deployments.

## 开发与构建 / Development and Build

```sh
npm run format:check
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run release:check
```

自动化测试使用临时数据和测试适配器，不调用真实模型。开发约定、协议生成和专项验证见[贡献指南](CONTRIBUTING.md)。

Automated tests use temporary data and test adapters; they do not call real models. See the [contribution guide](CONTRIBUTING.md) for development conventions, protocol generation, and specialized validation.

```sh
npm run tauri:build
```

构建会准备内置运行环境并验证其独立启动与恢复。未配置签名、公证时生成本地测试包。正式 macOS 发布需要目标团队的 Developer ID 证书和公证凭据，完整流程见[构建与发布](docs/releasing.md)。

The build prepares the bundled runtime and verifies that it can start and recover independently. Without signing and notarization configured, it produces a local test package. A production macOS release requires the target team’s Developer ID certificate and notarization credentials. See [Building and Releasing](docs/releasing.md) for the full process.

## 项目结构 / Project Structure

| 目录 / Directory        | 内容 / Contents                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `apps/desktop/`         | React 界面与 Tauri 桌面壳 / React interface and Tauri desktop shell                          |
| `apps/server/`          | Fastify、SQLite、Bot 协调与任务维护 / Fastify, SQLite, Bot coordination, and task management |
| `apps/bridge/`          | 本地 Agent 适配与执行 / Local Agent adapters and execution                                   |
| `apps/desktop-runtime/` | 安装包的后台启动入口 / Background launcher for the installer                                 |
| `packages/shared/`      | 共享类型、协议和 UI 校验 / Shared types, protocols, and UI validation                        |
| `scripts/`              | 启动、构建及验证脚本 / Launch, build, and validation scripts                                 |
| `tests/`                | 单元与浏览器测试 / Unit and browser tests                                                    |
| `docs/`                 | 架构、提示词与接入说明 / Architecture, prompts, and integration guides                       |

## 文档 / Documentation

- [文档索引 / Documentation index](docs/README.md)
- [整体架构 / Architecture](docs/architecture.md) 与 / and [持续工作设计 / Ongoing work design](docs/super-agent.md)
- [贡献指南 / Contribution guide](CONTRIBUTING.md)
- [故障排查与数据恢复 / Troubleshooting and data recovery](docs/troubleshooting.md)
- [安全说明与漏洞报告 / Security and vulnerability reporting](SECURITY.md)
- [构建与发布 / Building and releasing](docs/releasing.md)

## 许可证 / License

项目采用 [MIT License](LICENSE)。移植代码来源与第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

This project is licensed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for information about ported code and third-party dependencies.
