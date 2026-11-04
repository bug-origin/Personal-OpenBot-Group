# Personal OpenBot Group

[简体中文](README.md) | **English**

A collaborative desktop client where every Bot has its own memory, ongoing tasks, and local execution capabilities.

Chat with a Bot one-on-one, or create a group where multiple Bots work together. Each Bot uses a conversational model to independently interpret messages, maintain memory, plan tasks, and review results. A local Agent handles execution. Groups do not have a central “group brain” that assigns work.

## Download

See [GitHub Releases](https://github.com/bug-origin/Personal-OpenBot-Group/releases) for versions, installers, and checksums. macOS Apple Silicon is the currently verified platform.

## Key Features

- **Independent attention**: Bots use context to decide whether to participate. They skip this check in one-on-one chats, when directly @mentioned, and when replying to themselves. They respond politely to greetings and respect other people’s conversations and tasks.
- **Personal memory**: Each Bot’s identity, preferences, and task experience are saved persistently and carry across one-on-one and group chats, while access to sensitive information remains limited.
- **Ongoing goals**: Goals persist independently of Workers and support offline planning, next actions, waiting for conditions, deadlines, and reminders when an owner’s decision is needed.
- **Delegation and review**: Bots explicitly accept, deliver, and review delegated work. Project facts are shared with versioning, and deliverables separately track their creation, verification, acceptance, and actual use.
- **Asynchronous execution**: Track real progress, monitor for issues, stop or resume execution, and have the Bot review the evidence when work is complete.
- **Task pipeline**: Requirement changes and follow-up work can continue in the original session. Codex and Claude Code execution and handoffs are supported.
- **Local collaboration**: Manage groups and @mentions, and use Markdown, interactive forms, charts, and native permission requests.
- **Keep running when the window closes**: Closing the desktop window hides the app in the menu bar or system tray while it continues running in the background. Services stop only when you quit the app.

Personal OpenBot Group currently supports one owner on one computer. An installer build process is available for macOS Apple Silicon; Windows and Linux release packages have not yet been verified.

## Requirements

For source development, you need:

- Node.js **22.18 or later** and npm.
- The Codex CLI or Claude Code, signed in or configured with a provider as required by that tool.
- Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) to run the desktop window or build an installer.

Installers include Node.js, the local service, and the Bridge. You still need to configure a model API key. Local execution requires Codex CLI or Claude Code to be installed and signed in on your computer.

## Quick Start

```sh
npm ci
npm run desktop
```

On first launch:

1. Open **Settings** at the bottom, choose a model provider, enter an API key, load the model list, and select the primary conversation model.
2. The attention model follows the primary conversation model by default. You can also select another model from the same provider.
3. Create a Bot, enter its name and responsibilities, and choose Codex or Claude Code. A matching local Agent connects automatically; you can also create the identity while the Agent is offline. For an existing Bot, change the execution tool and device under **View execution status**.
4. Chat with a Bot one-on-one, or create a group and invite members.

Model settings support DeepSeek, OpenAI, Anthropic, Gemini, Qwen, Moonshot, Zhipu AI, and other OpenAI-compatible services. The primary conversation model handles communication and orchestration; the local Agent handles file and system operations.

News, up-to-date information, and web reading use the selected execution tool’s built-in web capabilities: Codex uses live search, and Claude Code provides WebSearch / WebFetch. Availability depends on the model service, account, and network. Web access follows each tool’s native permissions. If the selected tool is unavailable, tasks wait in the queue; they do not automatically switch to another tool.

To preview only the web interface:

```sh
npm run dev
```

The browser development URL is `http://127.0.0.1:1420`. The local service runs at `http://127.0.0.1:4310` by default.

## Optional Configuration

For regular use, configure models in Settings. When launching from source, you can also use a root-level `.env` file:

```sh
cp .env.example .env
```

See [.env.example](.env.example) for descriptions of each variable. Use `BRAIN_API_KEY` to set a shared server-side key, or use the key variable for a specific provider. The `.env` file supplies initial settings; settings saved on this device take precedence. Restart the service after changing environment variables.

- `ATTENTION_MODEL`: Separate attention model; leave blank to follow the primary conversation model.
- `OPENBOT_WORKERS_PER_BOT` / `OPENBOT_WORKERS_PER_DEVICE`: Maximum concurrent executions per Bot / per device; defaults to 2 / 4.
- `OPENBOT_TASK_TIMEOUT_MS`: Optional task timeout; defaults to 0, meaning no fixed overall time limit.
- `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH`: Paths to local execution tools, if you need to specify them.
- `OPENBOT_BRIDGE_AUTOSTART=false`: Disables automatic connection to the local Agent from the development launcher.

Codex and Claude Code use their own local settings and credentials; Personal OpenBot Group does not copy their sign-in information. File changes and command execution follow the local Agent’s native permission flow.

## Data and Recovery

- Source-development data is stored in `.data/` by default, including SQLite, model settings, device identity, and connection credentials.
- The desktop installer uses the system application data directory. On macOS, this is `~/Library/Application Support/com.openbot.desktop`.
- Bots, groups, chats, memories, tasks, and session mappings are saved persistently. Users create groups themselves.
- If a service or Agent is interrupted, tasks already sent with unknown results are not automatically rerun. Queued tasks that have not yet been sent can continue.
- SQLite migrations are in `apps/server/migrations/`; existing data is upgraded automatically. Do not delete historical migrations.

Keys, databases, logs, test output, and build artifacts are not part of the release source. They are listed in `.gitignore`; do not force-add them. The service listens only on the local loopback address and currently does not provide authentication for multi-user or remote deployments.

## Development and Build

```sh
npm run format:check
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run release:check
```

Automated tests use temporary data and test adapters; they do not call real models. See the [contribution guide](CONTRIBUTING.md) for development conventions, protocol generation, and specialized validation.

```sh
npm run tauri:build
```

The build prepares the bundled runtime and verifies that it can start and recover independently. Without signing and notarization configured, it produces a local test package. A production macOS release requires the target team’s Developer ID certificate and notarization credentials. See [Building and Releasing](docs/releasing.md) for the full process.

## Project Structure

| Directory               | Contents                                               |
| ----------------------- | ------------------------------------------------------ |
| `apps/desktop/`         | React interface and Tauri desktop shell                |
| `apps/server/`          | Fastify, SQLite, Bot coordination, and task management |
| `apps/bridge/`          | Local Agent adapters and execution                     |
| `apps/desktop-runtime/` | Background launcher for the installer                  |
| `packages/shared/`      | Shared types, protocols, and UI validation             |
| `scripts/`              | Launch, build, and validation scripts                  |
| `tests/`                | Unit and browser tests                                 |
| `docs/`                 | Architecture, prompts, and integration guides          |

## Documentation

The detailed guides below are currently available in Chinese.

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md) and [Ongoing work design](docs/super-agent.md)
- [Contribution guide](CONTRIBUTING.md)
- [Troubleshooting and data recovery](docs/troubleshooting.md)
- [Security and vulnerability reporting](SECURITY.md)
- [Building and releasing](docs/releasing.md)

## License

This project is licensed under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for information about ported code and third-party dependencies.
