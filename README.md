# OpenBot Desktop

让每位数字员工拥有独立记忆、持续任务和本地执行能力的协作客户端。

你可以与 Bot 私聊，也可以创建群组，让多个 Bot 一起工作。每个 Bot 使用对话模型独立判断消息、维护记忆、安排任务和检查结果；本地 Agent 负责执行。群组没有统一分配任务的“群大脑”。

## 下载

安装包与版本说明见 [GitHub Releases](https://github.com/bug-origin/Personal-Agent-Group/releases)。当前提供 macOS Apple Silicon 版本，应用名称为 OpenBot。

## 主要能力

- **独立注意力**：结合上下文判断是否参与；私聊、直接 @ 和回复自己跳过判断。礼貌回应日常招呼，尊重他人的对话与任务。
- **专属记忆**：每个 Bot 的身份、偏好与任务经验持久保存，私聊和群聊之间保持连续，并限制敏感信息的可见范围。
- **持续任务**：异步执行、真实进度回报、任务状态与异常监控；完成后由 Bot 根据证据验收。
- **任务管道**：同一工作的要求变更和后续处理可继续原会话；支持 Codex / Claude Code 执行与接力。
- **本地协作**：群组管理、@ 协作、Markdown、交互表单、图表和原生权限请求。
- **关闭窗口后继续**：桌面窗口关闭后隐藏到菜单栏／托盘，后台继续运行；明确退出应用才停止服务。

当前是单所有者、单机应用。macOS Apple Silicon 已有安装包构建流程，Windows / Linux 的发布包尚未验证。

## 环境要求

源码开发需要：

- Node.js **22.18 或更高版本**及 npm。
- 可用的 Codex CLI 或 Claude Code，按各工具自身的方式完成登录或 Provider 配置。
- 运行桌面窗口或打包时，需要 Rust 与 [Tauri 前置工具链](https://v2.tauri.app/start/prerequisites/)。

安装包自带 Node.js、本地服务和 Bridge；模型 API Key 和本地 Agent 仍需自行配置。

## 快速开始

```sh
npm ci
npm run desktop
```

首次使用时：

1. 打开底部「设置」，选择模型服务、填写 API Key、获取模型列表并选择主会话模型。
2. 注意力模型默认跟随主会话，也可以单独选择同一服务的其他模型。
3. 创建数字员工，填写名称与职责，选择本机已配置的执行工具。
4. 与数字员工单独聊天，或自行创建群组并邀请成员。

模型设置支持 DeepSeek、OpenAI、Anthropic、Gemini、通义千问、Moonshot、智谱及其他 OpenAI 兼容服务。主会话模型负责沟通与调度，本地 Agent 负责文件和系统操作。

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

Codex / Claude Code 沿用各自的本机配置与凭据，OpenBot 不复制其登录信息。文件修改和命令执行遵循本地 Agent 的原生权限流程。

## 数据与恢复

- 源码开发数据默认保存在 `.data/`，包含 SQLite、模型设置、设备标识与连接凭据。
- 桌面安装版使用系统应用数据目录；macOS 为 `~/Library/Application Support/com.openbot.desktop`。
- Bot、群组、聊天、记忆、任务和会话映射持久保存。群组由用户自行创建。
- 服务或 Agent 中断后，已发出但结果未知的任务不会自动重跑；尚未发出的排队任务可以继续。
- SQLite 迁移位于 `apps/server/migrations/`，现有数据自动升级；不要删除历史迁移。

密钥、数据库、日志、测试输出与构建产物均不属于发布源码。它们已列入 `.gitignore`；不要强制提交这些文件。服务只允许监听本机 loopback 地址，当前不提供多人或远程部署认证。

## 开发与检查

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run release:check
```

单元与浏览器测试使用临时数据和测试适配器，不调用真实模型，也不修改日常聊天。测试截图、跟踪和报告写入 `test-results/` 等忽略目录。

构建桌面安装包：

```sh
npm run tauri:build
```

构建会准备内置运行环境并验证其独立启动、连接、持久化及退出恢复。macOS 产物位于 `apps/desktop/src-tauri/target/release/bundle/`，文件名跟随项目版本。当前未配置自动更新。

维护者发布 macOS 包时，通过环境变量指定本机的 Developer ID Application 证书和已保存的 notarytool 凭据名称：

```sh
APPLE_SIGNING_IDENTITY='Developer ID Application: Your Organization (TEAMID)' \
APPLE_NOTARY_PROFILE='your-keychain-profile' npm run tauri:build
```

流程会签名内置 Node.js、SQLite 模块和应用，验证实际打包的后台，再公证应用与 DMG、附加公证票据并生成 `SHA256SUMS`。未指定证书或公证配置时，仅构建对应的本地测试包。签名已完成后，也可使用相同环境变量运行 `npm run tauri:build -- --notarize-only` 完成公证与重新生成 DMG。凭据只从本机钥匙串读取，不写入源码。

发布前检查会扫描 Git 待发布文件中的常见密钥、本机路径、数据库和构建残留；它不能替代人工检查。更改 UI 协议后运行 `npm run generate:ui`，并提交生成的静态校验器与组件目录。

真实模型验证需手动运行，可能产生 API 或本地 Agent 费用：

```sh
node --import tsx scripts/smoke-attention.mjs --live
node --import tsx scripts/smoke-social.mjs --live
node --import tsx scripts/smoke-coordinator.mjs
```

这些脚本使用假设输入或临时数据库；不会向日常群组发消息。其他专项检查见对应文档。

## 项目结构

```text
apps/desktop/          React 界面与 Tauri 桌面壳
apps/server/           Fastify、SQLite、Bot 协调与任务维护
apps/bridge/           本地 Agent 适配与执行
apps/desktop-runtime/  安装包的后台启动入口
packages/shared/       共享类型、协议和 UI 校验
scripts/               启动、构建及验证脚本
tests/                 单元与浏览器测试
docs/                  架构、提示词与接入说明
```

## 文档

- [整体架构](docs/architecture.md)
- [持续工作、记忆与任务管道](docs/super-agent.md)
- [当前提示词](docs/prompts-current.md)
- [Claude Code 接入](docs/claude.md)
- [原生提问与权限交互](docs/native-interactions.md)
- [动态卡片与渲染](docs/dynamic-rendering.md)

## 许可证

项目采用 [MIT License](LICENSE)。移植代码来源与第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
