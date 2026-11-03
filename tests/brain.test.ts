import { afterEach, expect, it, vi } from 'vitest';
import { createDeepSeekRouter } from '../apps/server/src/brain';
import type { RoutingInput } from '../apps/server/src/brain';
import { agentEnvironment } from '../apps/bridge/src/codex';
const config = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKey: 'test-only-key',
  enabled: true,
};
const input: RoutingInput = {
  group: { id: 'g', name: 'team', description: '', botIds: ['b'], createdAt: '' },
  bots: [
    {
      id: 'b',
      ownerId: 'u',
      name: 'Bob',
      description: 'Engineer',
      provider: 'codex',
      status: 'idle',
      bridgeId: 'bridge',
      createdAt: '',
    },
  ],
  messages: [],
  message: {
    id: 'm',
    groupId: 'g',
    senderId: 'u',
    senderType: 'human',
    content: '请评估方案',
    mentions: [],
    replyTo: null,
    timestamp: '',
    messageType: 'text',
    correlationId: 'c',
  },
};
afterEach(() => vi.unstubAllGlobals());
function response(content: string, finish = 'stop', status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }),
          { status, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
}
it('calls JSON mode with bounded context and validates selected bot ids', async () => {
  response('{"action":"wake","botIds":["b"],"reason":"Engineering question"}');
  const result = await createDeepSeekRouter(config)!(input, new AbortController().signal);
  expect(result.botIds).toEqual(['b']);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(request.response_format).toEqual({ type: 'json_object' });
  expect(request.thinking).toEqual({ type: 'disabled' });
  expect(request.tools).toBeUndefined();
  expect(request.messages[1].content).not.toContain(config.apiKey);
});
it.each([
  '',
  '   ',
  '{"action":"wake","botIds":["outsider"],"reason":"invalid"}',
  '{"action":"ignore","botIds":["b"],"reason":"invalid"}',
  '{"action":"wake","botIds":[],"reason":"invalid"}',
  '{"action":"wake","botIds":["b"],"reason":"x","command":"rm"}',
])('fails closed on blank, malformed or unauthorized decisions: %s', async (content) => {
  response(content);
  await expect(
    createDeepSeekRouter(config)!(input, new AbortController().signal),
  ).rejects.toThrow();
});
it('rejects truncated output and never returns the provider response body on errors', async () => {
  response('{"action":"ignore","botIds":[],"reason":"x"}', 'length');
  await expect(createDeepSeekRouter(config)!(input, new AbortController().signal)).rejects.toThrow(
    '不完整',
  );
  response('sensitive body', 'stop', 401);
  await expect(createDeepSeekRouter(config)!(input, new AbortController().signal)).rejects.toThrow(
    'HTTP 401',
  );
});
it('strips platform credentials from the native agent environment while preserving provider configuration', () => {
  const env = agentEnvironment({
    DEEPSEEK_API_KEY: 'secret',
    OPENBOT_BRIDGE_TOKEN: 'secret',
    OPENBOT_TOKEN: 'secret',
    VITE_OPENBOT_TOKEN: 'secret',
    BRAIN_MODEL: 'x',
    CODEX_THREAD_ID: 'parent',
    OPENAI_API_KEY: 'provider-owned',
    CODEX_HOME: '/owner/codex',
    PATH: '/bin',
  });
  expect(env).toEqual({
    OPENAI_API_KEY: 'provider-owned',
    CODEX_HOME: '/owner/codex',
    PATH: '/bin',
  });
});
