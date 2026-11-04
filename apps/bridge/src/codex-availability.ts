import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { agentEnvironment } from './codex.js';

type Availability = { available: boolean; reason?: string };

/** Ask the configured provider whether it requires OpenAI authentication.
 * `codex login status` only describes OpenAI login, not custom-provider readiness.
 * This handshake never starts a thread, invokes a model, or reads credentials.
 */
export function codexAvailability(
  executable: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 10000,
): Promise<Availability> {
  return new Promise((resolve) => {
    const child = spawn(executable, ['app-server', '--stdio'], {
      env: agentEnvironment(env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let outcome: Availability | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      () => finish({ available: false, reason: 'Codex 配置检查超时，请检查本地 CLI' }),
      timeoutMs,
    );
    function finish(result: Availability) {
      if (outcome) return;
      outcome = result;
      clearTimeout(timer);
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    }
    function send(message: unknown) {
      if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(message) + '\n');
    }
    child.stderr.resume();
    child.stdin.on('error', () => finish({ available: false, reason: 'Codex 配置检查连接已关闭' }));
    child.once('error', () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ available: false, reason: '无法启动 Codex，请检查本地 CLI 路径' });
    });
    child.once('close', () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve(outcome ?? { available: false, reason: 'Codex 配置检查未返回完整结果' });
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (outcome) return;
      try {
        if (line.length > 1_000_000) throw new Error('Oversized frame');
        const message = JSON.parse(line);
        if (message.method && message.id !== undefined) {
          send({ id: message.id, error: { code: -32601, message: 'Read-only provider probe' } });
          return;
        }
        if (message.id !== 1 && message.id !== 2) return;
        if (message.error) {
          finish({ available: false, reason: '无法检查 Codex 原生认证配置，请检查或更新 CLI' });
          return;
        }
        if (message.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'account/read', params: { refreshToken: false } });
          return;
        }
        const account = message.result;
        if (
          account?.requiresOpenaiAuth === false ||
          (account?.requiresOpenaiAuth === true && account.account)
        )
          finish({ available: true });
        else if (account?.requiresOpenaiAuth === true)
          finish({
            available: false,
            reason: '当前 Codex Provider 需要 OpenAI 登录',
          });
        else finish({ available: false, reason: 'Codex 未返回有效的认证配置，请检查或更新 CLI' });
      } catch {
        finish({ available: false, reason: 'Codex 返回了无效的配置检查数据' });
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'openbot_provider_check', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
