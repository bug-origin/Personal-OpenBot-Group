import { afterEach, expect, it, vi } from 'vitest';
import { createDialogueAgent } from '../apps/server/src/dialogue';
import type { DialogueInput } from '../apps/server/src/dialogue';
const config = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKey: 'test-only-key',
  enabled: true,
};
const input: DialogueInput = {
  bot: {
    id: 'b',
    name: 'Bob',
    description: 'Engineer',
    provider: 'codex',
    status: 'working',
    bridgeId: 'bridge',
    ownerId: 'u',
    createdAt: '',
  },
  group: {
    id: 'g',
    name: 'Group',
    botIds: ['b'],
    description: '',
    createdAt: '',
  },
  messages: [],
  memory: '先前决定',
  tasks: [],
  event: {
    kind: 'message',
    message: {
      id: 'm',
      groupId: 'g',
      senderId: 'u',
      senderType: 'human',
      content: '现在进度如何？',
      mentions: ['b'],
      replyTo: null,
      timestamp: '',
      messageType: 'text',
      correlationId: 'c',
    },
  },
};
afterEach(() => vi.unstubAllGlobals());
function respond(value: unknown, finish = 'stop') {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }],
          }),
        ),
    ),
  );
}
it('queries progress without exposing execution tools and bounds conversation history', async () => {
  respond({ decision: { action: 'status', taskId: null }, memory: '摘要' });
  const long = {
    ...input,
    messages: Array.from({ length: 40 }, (_, i) => ({
      ...input.event.message!,
      id: String(i),
      content: 'x'.repeat(8000),
    })),
  };
  expect(
    (await createDialogueAgent(config)!(long, new AbortController().signal)).decision.action,
  ).toBe('status');
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body.tools).toBeUndefined();
  expect(body.messages[0].content).toContain('Proactively choose a card');
  expect(body.messages[0].content).toContain(
    'let the execution bot render its own verified findings',
  );
  const envelope = JSON.parse(body.messages[1].content);
  expect(envelope.recentMessages).toHaveLength(12);
  expect(envelope.recentMessages.every((m: { content: string }) => m.content.length <= 1800)).toBe(
    true,
  );
  expect(envelope.memory).toBe('先前决定');
  expect(body.messages[1].content).not.toContain(config.apiKey);
});
it.each([
  { decision: { action: 'stop', taskId: 'outside-group' }, memory: '' },
  { decision: { action: 'reply', content: 'x', command: 'rm' }, memory: '' },
  { decision: { action: 'task', goal: '' }, memory: '' },
])('rejects unauthorized ids, extra fields and empty assignments', async (value) => {
  respond(value);
  await expect(createDialogueAgent(config)!(input, new AbortController().signal)).rejects.toThrow();
});
it('never lets a completion event dispatch another task and rejects truncation', async () => {
  respond({ decision: { action: 'task', goal: 'new work' }, memory: '' });
  await expect(
    createDialogueAgent(config)!(
      { ...input, event: { kind: 'completion' } },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  respond({ decision: { action: 'reply', content: 'x' }, memory: '' }, 'length');
  await expect(createDialogueAgent(config)!(input, new AbortController().signal)).rejects.toThrow(
    '不完整',
  );
});

it('repairs a malformed model response once, and bounds repeated failures', async () => {
  const response = (content: string) =>
    new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }));
  const transport = vi
    .fn()
    .mockResolvedValueOnce(response('{bad json'))
    .mockResolvedValueOnce(
      response(JSON.stringify({ decision: { action: 'reply', content: '收到' }, memory: null })),
    );
  vi.stubGlobal('fetch', transport);
  expect(
    (await createDialogueAgent(config)!(input, new AbortController().signal)).decision.action,
  ).toBe('reply');
  expect(transport).toHaveBeenCalledTimes(2);
  transport.mockReset().mockImplementation(async () => response('{bad json'));
  await expect(createDialogueAgent(config)!(input, new AbortController().signal)).rejects.toThrow(
    '格式无效',
  );
  expect(transport).toHaveBeenCalledTimes(2);
});
