import { spawnSync } from 'node:child_process';
import type { BridgeInfo, Provider } from '@openbot/shared';
import { agentEnvironment } from './codex.js';
import { codexAvailability } from './codex-availability.js';

export async function discoverProviders(env: NodeJS.ProcessEnv = process.env) {
  const executables: Record<Provider, string> = {
    codex: env.OPENBOT_CODEX_PATH ?? 'codex',
    'claude-code': env.OPENBOT_CLAUDE_PATH ?? 'claude',
  };
  const run = (provider: Provider, args: string[]) =>
    spawnSync(executables[provider], args, {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 262144,
      env: agentEnvironment(env),
    });
  const providers: BridgeInfo['providers'] = await Promise.all(
    (['codex', 'claude-code'] as const).map(async (provider) => {
      const version = run(provider, ['--version']);
      if (version.status !== 0)
        return {
          provider,
          version: 'not installed',
          available: false,
          reason:
            provider === 'codex'
              ? '本机需安装 Codex CLI，并完成账号登录'
              : '本机需安装 Claude Code，并完成账号登录',
        };
      if (provider === 'codex')
        return {
          provider,
          version: version.stdout.trim().slice(0, 80),
          ...(await codexAvailability(executables.codex, env)),
        };
      const auth = run(provider, ['auth', 'status']);
      let authenticated = auth.status === 0;
      if (provider === 'claude-code') {
        try {
          authenticated = authenticated && JSON.parse(auth.stdout).loggedIn === true;
        } catch {
          authenticated = false;
        }
        const help = run(provider, ['--help']);
        if (
          help.status !== 0 ||
          ![
            '--restricted',
            '--safe-mode',
            '--permission-prompts',
            '--system-prompt-snapshot',
            '--replay-user-messages',
          ].every((flag) => help.stdout.includes(flag))
        )
          return {
            provider,
            version: version.stdout.trim().slice(0, 80),
            available: false,
            reason: '请更新 Claude Code，当前版本不支持所需的受限执行接口',
          };
      }
      return {
        provider,
        version: version.stdout.trim().slice(0, 80),
        available: authenticated,
        ...(!authenticated
          ? {
              reason: 'Claude Code 尚未完成本机账号登录',
            }
          : {}),
      };
    }),
  );
  return { executables, providers };
}
