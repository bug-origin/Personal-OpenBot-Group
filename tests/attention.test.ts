import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentJob, BridgeCommand, Message } from '@openbot/shared';
import { createApp } from '../apps/server/src/app';
import {
  attentionDecision,
  createAttentionModel,
  type AttentionInput,
  type AttentionModel,
} from '../apps/server/src/attention-model';
import type { CoordinatorMessage, CoordinatorModel } from '../apps/server/src/coordinator-model';

const token = 'isolated-attention-test-token';
const dirs: string[] = [];
let instance: Awaited<ReturnType<typeof createApp>> | undefined;
let commands: BridgeCommand[] = [];
const empty = (): CoordinatorMessage => ({ role: 'assistant', content: '' });
const say = (content: string): CoordinatorMessage => ({ role: 'assistant', content });
const call = (name: string, args: object): CoordinatorMessage => ({
  role: 'assistant',
  content: null,
  tool_calls: [
    { id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } },
  ],
});
const context = (messages: CoordinatorMessage[]) => JSON.parse(messages[1].content!);
const api = (
  url: string,
  payload?: unknown,
  method: 'POST' | 'GET' | 'PATCH' = payload ? 'POST' : 'GET',
) => instance!.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
async function setup(
  model: CoordinatorModel,
  attention: AttentionModel,
  path?: string,
  maxRounds = 6,
) {
  if (!path) {
    const dir = mkdtempSync(join(tmpdir(), 'openbot-attention-'));
    dirs.push(dir);
    path = join(dir, 'db.sqlite');
  }
  commands = [];
  instance = await createApp({
    databasePath: path,
    token,
    coordinator: model,
    attention,
    maxRounds,
  });
  instance.runtime.attach(
    {
      id: 'test-device',
      name: 'test',
      providers: [{ provider: 'codex', available: true, version: 'test' }],
    },
    (c) => commands.push(c),
    () => instance?.runtime.detach('test-device'),
  );
  return path;
}
async function bot(name: string, description = '') {
  const r = await api('/api/bots', { name, description, provider: 'codex' });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}
async function group(botIds: string[]) {
  return (await api('/api/groups', { name: '产品实验室', botIds })).json().id as string;
}
async function send(groupId: string, content: string, replyTo?: string) {
  const r = await api('/api/messages', {
    id: randomUUID(),
    groupId,
    content,
    ...(replyTo ? { replyTo } : {}),
  });
  expect(r.statusCode).toBe(201);
  return r.json() as Message;
}
async function idle() {
  await expect
    .poll(() =>
      instance!.store.db
        .prepare("SELECT count(*) AS n FROM dialogue_inbox WHERE status IN ('queued','processing')")
        .get(),
    )
    .toEqual({ n: 0 });
}
function insertBot(source: Message, botId: string, content: string, fields: Partial<Message> = {}) {
  const m: Message = {
    ...source,
    id: randomUUID(),
    senderId: botId,
    senderType: 'bot',
    content,
    mentions: [],
    replyTo: source.id,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  instance!.store.insertMessage(m);
  return m;
}
const jobs = () =>
  commands.filter((c): c is { type: 'run'; job: AgentJob } => c.type === 'run').map((c) => c.job);
afterEach(async () => {
  await instance?.app.close();
  instance = undefined;
  vi.unstubAllGlobals();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('keeps a false decision out of the main model, tools, tasks and memory while preserving the source', async () => {
  const main = vi.fn<CoordinatorModel>(async () =>
    call('start_worker', { goal: 'should not run' }),
  );
  const attention = vi.fn<AttentionModel>(async () => ({ wake: false }));
  await setup(main, attention);
  const g = await group([await bot('BB'), await bot('DEV')]);
  const source = await send(g, '得先琢磨琢磨');
  await idle();
  expect(attention).toHaveBeenCalledTimes(2);
  expect(main).not.toHaveBeenCalled();
  expect(instance!.store.snapshot().messages).toEqual([expect.objectContaining({ id: source.id })]);
  for (const table of ['coordinator_turns', 'coordinator_calls', 'tasks', 'bot_memory'])
    expect(instance!.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
      n: 0,
    });
  expect(
    instance!.store.db.prepare('SELECT status,wake,attempts FROM attention_decisions').all(),
  ).toEqual([
    { status: 'completed', wake: 0, attempts: 1 },
    { status: 'completed', wake: 0, attempts: 1 },
  ]);
  expect(instance!.store.db.prepare('SELECT DISTINCT status FROM dialogue_inbox').all()).toEqual([
    { status: 'ignored' },
  ]);
});

it('delivers a human group greeting to each admitted Bot without a Bot greeting loop or task side effects', async () => {
  const main = vi.fn<CoordinatorModel>(async () => say('你好！'));
  const attention = vi.fn<AttentionModel>(async (i) => ({
    wake: i.message.actor.type === 'human',
  }));
  await setup(main, attention);
  const bb = await bot('BB'),
    dev = await bot('DEV');
  const source = await send(await group([bb, dev]), '大家好');
  await idle();
  expect(main).toHaveBeenCalledTimes(2);
  const replies = instance!.store.snapshot().messages.filter((m) => m.senderType === 'bot');
  expect(replies).toHaveLength(2);
  expect(replies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ senderId: bb, content: '你好！', replyTo: source.id }),
      expect.objectContaining({ senderId: dev, content: '你好！', replyTo: source.id }),
    ]),
  );
  expect(attention.mock.calls.filter(([i]) => i.message.actor.type === 'bot')).toHaveLength(2);
  expect(instance!.store.snapshot().tasks).toHaveLength(0);
  expect(instance!.store.db.prepare('SELECT count(*) AS n FROM bot_memory').get()).toEqual({
    n: 0,
  });
});

it('admits only the selected Bot and still permits the main model to stay silent', async () => {
  const main = vi.fn<CoordinatorModel>(async (messages) =>
    messages.at(-1)?.role === 'tool'
      ? empty()
      : call('remember', { key: 'preference', content: '先讨论，再实施' }),
  );
  await setup(main, async (i) => ({ wake: i.bot.name === 'BB' }));
  const bb = await bot('BB'),
    dev = await bot('DEV');
  await send(await group([bb, dev]), 'BB继续吧');
  await idle();
  expect(main).toHaveBeenCalledTimes(2);
  expect(main.mock.calls.every(([m]) => context(m).bot.id === bb)).toBe(true);
  expect(instance!.store.db.prepare('SELECT bot_id,content FROM bot_memory').all()).toEqual([
    { bot_id: bb, content: '先讨论，再实施' },
  ]);
  expect(instance!.store.snapshot().messages).toHaveLength(1);
  expect(jobs()).toHaveLength(0);
});

it('bypasses attention for direct chats, explicit mentions and replies to this Bot', async () => {
  const main = vi.fn<CoordinatorModel>(async () => empty());
  const attention = vi.fn<AttentionModel>(async () => ({ wake: false }));
  await setup(main, attention);
  const bb = await bot('BB');
  const g = await group([bb]);
  const dm = (await api(`/api/bots/${bb}/chat`, {})).json();
  await send(dm.id, '你好');
  const first = await send(g, '@BB 帮我看一下');
  await idle();
  const prior = insertBot(first, bb, '选 A 还是 B？');
  await send(g, 'A', prior.id);
  await idle();
  expect(main).toHaveBeenCalledTimes(3);
  expect(attention).not.toHaveBeenCalled();
  expect(
    instance!.store.db.prepare('SELECT DISTINCT status,attempts FROM attention_decisions').all(),
  ).toEqual([{ status: 'bypassed', attempts: 0 }]);
});

it('bypasses attention for own completion and progress events, including result acceptance', async () => {
  const attention = vi.fn<AttentionModel>(async () => ({ wake: false }));
  await setup(async (messages) => {
    if (messages.at(-1)?.role === 'tool') return empty();
    const data = context(messages);
    if (data.event.kind === 'completion')
      return call('finish_task', { taskId: data.event.taskId, verification: '已核对真实结果' });
    if (data.event.kind === 'watchdog') return empty();
    return call('start_worker', { goal: '只读验证' });
  }, attention);
  const bb = await bot('BB');
  await send(await group([bb]), '@BB 验证');
  await idle();
  const task = instance!.store.snapshot().tasks[0];
  instance!.runtime.checkProgress(Date.parse(task.execution!.updatedAt) + 300001);
  await idle();
  const job = jobs()[0];
  instance!.runtime.event('test-device', {
    type: 'result',
    taskId: task.id,
    leaseId: job.leaseId,
    status: 'completed',
    text: '实际证据',
  });
  await idle();
  expect(instance!.store.snapshot().tasks[0].status).toBe('completed');
  expect(attention).not.toHaveBeenCalled();
  expect(
    instance!.store.db
      .prepare("SELECT count(*) AS n FROM attention_decisions WHERE status='bypassed'")
      .get(),
  ).toEqual({ n: 3 });
});

it('sends ordinary Bot messages through each other member’s own attention gate without self echo', async () => {
  const main = vi.fn<CoordinatorModel>(async () => empty());
  const attention = vi.fn<AttentionModel>(async (i) => ({
    wake: i.message.actor.type === 'bot' && i.bot.name === 'DEV',
  }));
  await setup(main, attention);
  const bb = await bot('BB'),
    dev = await bot('DEV'),
    qa = await bot('QA');
  const g = await group([bb, dev, qa]);
  const source = await send(g, '先讨论');
  await idle();
  attention.mockClear();
  const report = insertBot(source, bb, '这个方案需要核实接口是否支持');
  instance!.runtime.accept(report);
  await idle();
  expect(attention.mock.calls.map(([i]) => i.bot.id).sort()).toEqual([dev, qa].sort());
  expect(main).toHaveBeenCalledTimes(1);
  expect(context(main.mock.calls[0][0]).event.actor.id).toBe(bb);
  expect(
    instance!.store.db
      .prepare('SELECT bot_wakes FROM collaboration_chains WHERE id=?')
      .get(source.correlationId),
  ).toEqual({ bot_wakes: 1 });
  instance!.runtime.accept(report);
  await idle();
  expect(main).toHaveBeenCalledTimes(1);
});

it('lets Bots explicitly request help and return a result without waking unrelated colleagues', async () => {
  const main = vi.fn<CoordinatorModel>(async (messages) => {
    const data = context(messages);
    if (data.bot.name === 'BB')
      return data.event.actor.type === 'human' ? say('@DEV 请核对接口') : empty();
    return say('@BB 接口已核对');
  });
  const attention = vi.fn<AttentionModel>(async () => ({ wake: false }));
  await setup(main, attention);
  const bb = await bot('BB'),
    dev = await bot('DEV'),
    qa = await bot('QA');
  await send(await group([bb, dev, qa]), '@BB 请评估方案');
  await idle();
  expect(main).toHaveBeenCalledTimes(3);
  expect(main.mock.calls.map(([m]) => context(m).bot.id)).toEqual([bb, dev, bb]);
  expect(instance!.store.snapshot().messages.filter((m) => m.senderType === 'bot')).toHaveLength(2);
  expect(instance!.store.snapshot().tasks).toHaveLength(0);
  expect(instance!.store.db.prepare('SELECT bot_wakes FROM collaboration_chains').get()).toEqual({
    bot_wakes: 2,
  });
});

it('retains the exact source boundary, role, reply target and completed/failed task ownership', async () => {
  const attention = vi.fn<AttentionModel>(async () => ({ wake: false }));
  await setup(
    async (messages) =>
      messages.at(-1)?.role === 'tool' ? empty() : call('start_worker', { goal: 'BB的产品调研' }),
    attention,
  );
  const bb = await bot('BB', '互联网产品经理'),
    dev = await bot('DEV', '万能资深开发');
  const g = await group([bb, dev]);
  const source = await send(g, '@BB 开始调研');
  await idle();
  instance!.store.db
    .prepare("UPDATE tasks SET status='failed',error='test failure' WHERE id=?")
    .run(jobs()[0].task.id);
  insertBot(source, bb, '选 A 还是 B？');
  const other = await group([bb]);
  await send(other, '@BB 另一个群的私密内容');
  await idle();
  attention.mockClear();
  const current = await send(g, 'A');
  const future = insertBot(current, bb, '不应提前看到的未来消息', {
    timestamp: new Date(Date.now() + 60000).toISOString(),
  });
  await idle();
  const devInput = attention.mock.calls.find(([i]) => i.bot.id === dev)![0];
  expect(devInput.bot.role).toBe('万能资深开发');
  expect(devInput.tasks).toContainEqual(
    expect.objectContaining({ ownerBotId: bb, goal: 'BB的产品调研', status: 'failed' }),
  );
  expect(devInput.recentMessages.at(-1)?.id).toBe(current.id);
  expect(
    devInput.recentMessages.some((m) => m.id === future.id || m.content.includes('私密内容')),
  ).toBe(false);
  expect(JSON.stringify(devInput)).not.toMatch(/apiKey|Bearer|coordinatorTools/);
});

it('retries attention errors three times, exposes a retryable failure, and never treats failure as silence', async () => {
  const main = vi.fn<CoordinatorModel>(async () => empty());
  const attention = vi.fn<AttentionModel>(async () => {
    throw new Error('transport included isolated-secret');
  });
  await setup(main, attention);
  const b = await bot('DEV');
  const source = await send(await group([b]), '需要你判断吗');
  await idle();
  expect(attention).toHaveBeenCalledTimes(3);
  expect(main).not.toHaveBeenCalled();
  expect(instance!.store.snapshot().dialogueFailures).toEqual([
    expect.objectContaining({
      botId: b,
      messageId: source.id,
      stage: 'attention',
      error: expect.stringContaining('注意力模型暂不可用'),
    }),
  ]);
  expect(JSON.stringify(instance!.store.snapshot())).not.toContain('isolated-secret');
  expect(
    instance!.store.db.prepare('SELECT status,wake,attempts FROM attention_decisions').get(),
  ).toEqual({ status: 'failed', wake: null, attempts: 3 });
  attention.mockResolvedValue({ wake: true });
  expect((await api(`/api/messages/${source.id}/retry`, { botId: b })).json()).toEqual({
    ok: true,
    retried: true,
  });
  await idle();
  expect(main).toHaveBeenCalledTimes(1);
  expect(instance!.store.snapshot().dialogueFailures).toEqual([]);
  expect((await api(`/api/messages/${source.id}/retry`, { botId: b })).json()).toEqual({
    ok: true,
    retried: false,
  });
});

it('permits authenticated retry of a failed ordinary Bot collaboration message', async () => {
  let fail = true;
  const main = vi.fn<CoordinatorModel>(async () => empty());
  await setup(main, async (i) => {
    if (i.message.actor.type !== 'bot') return { wake: false };
    if (fail) throw new Error('network');
    return { wake: true };
  });
  const bb = await bot('BB'),
    dev = await bot('DEV');
  const source = await send(await group([bb, dev]), '先讨论');
  await idle();
  const result = insertBot(source, bb, '需要确认接口限制');
  instance!.runtime.accept(result);
  await idle();
  expect(instance!.store.snapshot().dialogueFailures?.[0]).toMatchObject({
    messageId: result.id,
    stage: 'attention',
  });
  fail = false;
  expect((await api(`/api/messages/${result.id}/retry`, { botId: dev })).json().retried).toBe(true);
  await idle();
  expect(main).toHaveBeenCalledTimes(1);
});

it('preserves retry attempts across an interrupted attention request', async () => {
  const waiting = vi.fn<AttentionModel>(
    async (_, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('closed')), { once: true }),
      ),
  );
  const main = vi.fn<CoordinatorModel>(async () => empty());
  const path = await setup(main, waiting);
  const b = await bot('DEV');
  await send(await group([b]), '判断');
  await expect.poll(() => waiting.mock.calls.length).toBe(1);
  await instance!.app.close();
  instance = undefined;
  const failing = vi.fn<AttentionModel>(async () => {
    throw new Error('network');
  });
  await setup(main, failing, path);
  await idle();
  expect(failing).toHaveBeenCalledTimes(2);
  expect(main).not.toHaveBeenCalled();
  expect(
    instance!.store.db.prepare('SELECT attempts,status FROM attention_decisions').get(),
  ).toEqual({ attempts: 3, status: 'failed' });
});

it('reuses committed false decisions after restart without reclassification or side effects', async () => {
  const main = vi.fn<CoordinatorModel>(async () => empty());
  const first = vi.fn<AttentionModel>(async () => ({ wake: false }));
  const path = await setup(main, first);
  await send(await group([await bot('DEV')]), '无关消息');
  await idle();
  instance!.store.db.prepare("UPDATE dialogue_inbox SET status='queued'").run();
  await instance!.app.close();
  instance = undefined;
  const next = vi.fn<AttentionModel>(async () => ({ wake: true }));
  await setup(main, next, path);
  await idle();
  expect(next).not.toHaveBeenCalled();
  expect(main).not.toHaveBeenCalled();
});

it('resumes an admitted main turn without a second attention decision or collaboration charge', async () => {
  const attention = vi.fn<AttentionModel>(async (i) => ({ wake: i.message.actor.type === 'bot' }));
  let blocked = false;
  const path = await setup(async (_, signal) => {
    blocked = true;
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(new Error('closed')), { once: true }),
    );
  }, attention);
  const bb = await bot('BB'),
    dev = await bot('DEV');
  const source = await send(await group([bb, dev]), '先讨论');
  await idle();
  const result = insertBot(source, bb, '需要核对结果');
  instance!.runtime.accept(result);
  await expect.poll(() => blocked).toBe(true);
  expect(instance!.store.db.prepare('SELECT bot_wakes FROM collaboration_chains').get()).toEqual({
    bot_wakes: 1,
  });
  await instance!.app.close();
  instance = undefined;
  const next = vi.fn<AttentionModel>(async () => ({ wake: true }));
  await setup(async () => empty(), next, path);
  await idle();
  expect(next).not.toHaveBeenCalled();
  expect(instance!.store.db.prepare('SELECT bot_wakes FROM collaboration_chains').get()).toEqual({
    bot_wakes: 1,
  });
});

it('charges only actual Bot wakes, bounds loops durably, and does not charge passive fan-out', async () => {
  const main = vi.fn<CoordinatorModel>(async () => say('继续核对'));
  await setup(main, async (i) => ({ wake: i.message.actor.type === 'bot' }), undefined, 100);
  const ids = await Promise.all(['BB', 'DEV', 'QA', 'OPS'].map((n) => bot(n)));
  const g = await group(ids);
  const source = await send(g, '先讨论');
  await idle();
  instance!.store.db.prepare('UPDATE collaboration_chains SET max_calls=2').run();
  const first = insertBot(source, ids[0], '请检查结果');
  instance!.runtime.accept(first);
  await idle();
  expect(main).toHaveBeenCalledTimes(2);
  expect(instance!.store.db.prepare('SELECT bot_wakes FROM collaboration_chains').get()).toEqual({
    bot_wakes: 2,
  });
  expect(
    (
      instance!.store.db
        .prepare("SELECT count(*) AS n FROM attention_decisions WHERE status='budget_limited'")
        .get() as { n: number }
    ).n,
  ).toBeGreaterThan(0);
  expect(instance!.store.snapshot().tasks).toHaveLength(0);
  const count = instance!.store.snapshot().messages.length;
  instance!.runtime.accept(first);
  await idle();
  expect(instance!.store.snapshot().messages).toHaveLength(count);
});

it('respects a stop recorded before an attention response', async () => {
  let release!: () => void;
  let started = false;
  const main = vi.fn<CoordinatorModel>(async () => say('还有一个结果'));
  await setup(main, async (i) => {
    if (i.message.actor.type === 'human') return { wake: false };
    started = true;
    return new Promise((resolve) => {
      release = () => resolve({ wake: true });
    });
  });
  const bb = await bot('BB'),
    dev = await bot('DEV');
  const source = await send(await group([bb, dev]), '先讨论');
  await idle();
  const report = insertBot(source, bb, '待处理');
  instance!.runtime.accept(report);
  await expect.poll(() => started).toBe(true);
  instance!.store.db.prepare('UPDATE collaboration_chains SET stopped=1').run();
  release();
  await idle();
  expect(main).not.toHaveBeenCalled();
  expect(instance!.store.db.prepare('SELECT bot_wakes FROM collaboration_chains').get()).toEqual({
    bot_wakes: 0,
  });
});

it('limits the depth of a direct Bot reply chain independently of the call budget', async () => {
  const main = vi.fn<CoordinatorModel>(async () => say('继续核对'));
  await setup(main, async (i) => ({ wake: i.message.actor.type === 'bot' }), undefined, 1);
  const bb = await bot('BB'),
    dev = await bot('DEV');
  const source = await send(await group([bb, dev]), '先讨论');
  await idle();
  instance!.runtime.accept(insertBot(source, bb, '核对结果'));
  await idle();
  expect(main).toHaveBeenCalledTimes(1);
  expect(
    instance!.store.db.prepare('SELECT bot_wakes,max_calls FROM collaboration_chains').get(),
  ).toEqual({ bot_wakes: 1, max_calls: 12 });
});

const attentionInput: AttentionInput = {
  bot: { id: 'dev', name: 'DEV', role: '开发' },
  group: { id: 'g', name: '测试', members: [] },
  message: {
    id: 'm',
    actor: { id: 'user', type: 'human', name: '我' },
    content: 'BB继续吧',
    mentions: [],
    replyTo: null,
  },
  replyTarget: null,
  recentMessages: [],
  tasks: [],
};
it.each([{}, { wake: 'false' }, { wake: 0 }, { wake: null }, { wake: true, reason: 'extra' }])(
  'rejects invalid attention decisions: %j',
  (value) => {
    expect(() => attentionDecision.parse(value)).toThrow();
  },
);
it.each(['{"wake":false}', '{"wake":true}'])(
  'accepts strict boolean decisions: %s',
  async (content) => {
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }),
        ),
    );
    vi.stubGlobal('fetch', transport);
    const model = createAttentionModel({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'attention-test-model',
      apiKey: 'isolated-secret',
      enabled: true,
    })!;
    expect(await model(attentionInput, new AbortController().signal)).toEqual(JSON.parse(content));
    const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      model: 'attention-test-model',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(JSON.parse(body.messages[1].content)).toEqual(attentionInput);
    expect(JSON.stringify(body)).not.toContain('isolated-secret');
  },
);
it.each([
  { finish_reason: 'stop', message: { content: '```json\n{"wake":false}\n```' } },
  { finish_reason: 'stop', message: { content: '{"wake":false,"reason":"unrelated"}' } },
  { finish_reason: 'stop', message: { content: '{"wake":"false"}' } },
  { finish_reason: 'length', message: { content: '{"wake":false}' } },
  { finish_reason: 'stop', message: { content: '{"wake":false}', tool_calls: [{}] } },
])('rejects prose, extra fields, coercion, truncation and tool output: %j', async (choice) => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [choice] })));
  const model = createAttentionModel({
    provider: 'openai',
    baseUrl: 'https://example.test/v1',
    model: 'test',
    apiKey: 'isolated-secret',
    enabled: true,
  })!;
  await expect(model(attentionInput, new AbortController().signal)).rejects.toThrow(
    /注意力模型返回/,
  );
});
it('uses Anthropic’s tool-free native protocol and checks its completion reason', async () => {
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '{"wake":false}' }],
        }),
      ),
  );
  vi.stubGlobal('fetch', transport);
  const model = createAttentionModel({
    provider: 'anthropic',
    baseUrl: 'https://example.test/v1',
    model: 'test-native-model',
    apiKey: 'isolated-secret',
    enabled: true,
  })!;
  expect(await model(attentionInput, new AbortController().signal)).toEqual({ wake: false });
  expect(transport.mock.calls[0][0]).toBe('https://example.test/v1/messages');
  const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(body).not.toHaveProperty('tools');
  expect(body.system).toContain('只允许 {"wake":true}');
  expect(body.messages).toHaveLength(1);
  transport.mockResolvedValue(
    new Response(
      JSON.stringify({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '{"wake":true}' }],
      }),
    ),
  );
  await expect(model(attentionInput, new AbortController().signal)).rejects.toThrow(
    '注意力模型返回不完整',
  );
});
