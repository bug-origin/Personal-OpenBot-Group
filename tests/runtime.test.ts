import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentJob, BridgeCommand, Snapshot } from '@openbot/shared';
import type { BrainRouter } from '../apps/server/src/brain';
import type { DialogueAgent, DialogueInput } from '../apps/server/src/dialogue';
import { createApp } from '../apps/server/src/app';
const token = 'client-token-for-tests-only-00000',
  bridgeToken = 'bridge-token-for-tests-only-00000';
let directory: string;
let instance: Awaited<ReturnType<typeof createApp>>;
let commands: BridgeCommand[];
let bridgeId: string;
const jobs = () =>
  commands.filter((c): c is { type: 'run'; job: AgentJob } => c.type === 'run').map((c) => c.job);
async function api(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
  return instance.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}
async function state() {
  return (await api('GET', '/api/snapshot')).json<Snapshot>();
}
async function setup(brain?: BrainRouter, maxRounds = 6, dialogue?: DialogueAgent) {
  instance = await createApp({
    databasePath: join(directory, 'db.sqlite'),
    token,
    bridgeToken,
    brain,
    dialogue,
    maxRounds,
  });
  await instance.app.ready();
  instance.runtime.attach(
    {
      id: bridgeId,
      name: 'Test bridge',
      providers: [{ provider: 'codex', version: 'test-adapter', available: true }],
    },
    (c) => commands.push(c),
    () => instance.runtime.detach(bridgeId),
  );
}
async function bot(name = 'Bob') {
  const r = await api('POST', '/api/bots', { name, provider: 'codex' });
  expect(r.statusCode).toBe(201);
  const id = r.json().id;
  expect((await api('POST', `/api/bots/${id}/bind`, { bridgeId })).statusCode).toBe(200);
  return id as string;
}
async function group(botIds: string[], name = 'team') {
  return (await api('POST', '/api/groups', { name, botIds })).json().id as string;
}
async function message(groupId: string, content: string, id = randomUUID()) {
  const r = await api('POST', '/api/messages', { id, groupId, content });
  expect([200, 201]).toContain(r.statusCode);
  return r.json();
}
function event(job: AgentJob, fields: Record<string, unknown>) {
  instance.runtime.event(bridgeId, {
    taskId: job.task.id,
    leaseId: job.leaseId,
    ...fields,
    type: fields.type as string,
  });
}
function finish(job: AgentJob, text = '实际测试适配器输出') {
  event(job, { type: 'result', status: 'completed', text });
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'openbot-runtime-'));
  commands = [];
  bridgeId = randomUUID();
});
afterEach(async () => {
  await instance?.app.close();
  rmSync(directory, { recursive: true, force: true });
});
describe('execution queue and scoped sessions', () => {
  it('serializes one bot across groups and restores only the matching native session', async () => {
    await setup();
    const b = await bot();
    const a = await group([b], 'A'),
      c = await group([b], 'B');
    await message(a, '@Bob private A');
    await message(c, '@Bob private B');
    await expect.poll(() => jobs().length).toBe(1);
    const first = jobs()[0];
    expect(first.messages.every((m) => m.groupId === a)).toBe(true);
    event(first, { type: 'session', threadId: 'native-A' });
    finish(first);
    await expect.poll(() => jobs().length).toBe(2);
    const second = jobs()[1];
    expect(second.session).toBeNull();
    expect(second.messages.every((m) => m.groupId === c)).toBe(true);
    event(second, { type: 'session', threadId: 'native-B' });
    finish(second);
    await message(a, '@Bob followup A');
    await expect.poll(() => jobs().length).toBe(3);
    expect(jobs()[2].session?.threadId).toBe('native-A');
    expect(jobs()[2].messages.some((m) => m.content.includes('private B'))).toBe(false);
  });
  it('does not let a stale lease publish a reply or consume the active task', async () => {
    await setup();
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob test');
    await expect.poll(() => jobs().length).toBe(1);
    const j = jobs()[0];
    instance.runtime.event(bridgeId, {
      type: 'result',
      taskId: j.task.id,
      leaseId: randomUUID(),
      status: 'completed',
      text: 'forged',
    });
    expect((await state()).messages.some((m) => m.content === 'forged')).toBe(false);
    expect((await state()).tasks[0].status).toBe('running');
  });
  it('keeps a queued task over disconnect and never blindly reruns an uncertain execution', async () => {
    await setup();
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob first');
    await message(g, '@Bob second');
    await expect.poll(() => jobs().length).toBe(1);
    instance.runtime.detach(bridgeId);
    let s = await state();
    expect(s.tasks.map((t) => t.status)).toEqual(['failed', 'queued']);
    expect(s.bots[0].status).toBe('offline');
    instance.runtime.attach(
      {
        id: bridgeId,
        name: 'reconnected',
        providers: [{ provider: 'codex', version: 'test', available: true }],
      },
      (c) => commands.push(c),
      () => {},
    );
    await expect.poll(() => jobs().length).toBe(2);
    expect(jobs()[1].task.input).toBe('@Bob second');
    s = await state();
    expect(s.messages.some((m) => m.content.includes('执行结果未知'))).toBe(true);
  });
  it('rechecks membership when a queued task becomes eligible', async () => {
    await setup();
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob first');
    await message(g, '@Bob second');
    await expect.poll(() => jobs().length).toBe(1);
    await api('PATCH', `/api/groups/${g}`, { name: 'removed', botIds: [] });
    finish(jobs()[0]);
    await expect.poll(async () => (await state()).tasks[1].status).toBe('cancelled');
    expect(jobs()).toHaveLength(1);
  });
});
describe('group brain and collaboration bounds', () => {
  it('bypasses the brain for explicit mentions and routes an ordinary message exactly once', async () => {
    let target = '';
    const router = vi.fn<BrainRouter>(async () => ({
      action: 'wake',
      botIds: [target],
      reason: 'question',
    }));
    await setup(router);
    target = await bot();
    const g = await group([target]);
    await message(g, '@Bob direct');
    await expect.poll(() => jobs().length).toBe(1);
    expect(router).not.toHaveBeenCalled();
    finish(jobs()[0]);
    const id = randomUUID();
    await message(g, '请评估我们的方案', id);
    await message(g, '请评估我们的方案', id);
    await expect.poll(() => jobs().length).toBe(2);
    expect(router).toHaveBeenCalledTimes(1);
    expect(router.mock.calls[0][0].messages.every((m) => m.groupId === g)).toBe(true);
  });
  it('ignores casual messages and exposes no provider credential in snapshots', async () => {
    await setup(async () => ({ action: 'ignore', botIds: [], reason: 'thanks' }));
    const b = await bot(),
      g = await group([b]);
    await message(g, '谢谢');
    await expect
      .poll(() => instance.store.db.prepare('SELECT status FROM routing_decisions').get())
      .toMatchObject({ status: 'completed' });
    expect(jobs()).toHaveLength(0);
    expect(JSON.stringify(await state())).not.toContain(bridgeToken);
  });
  it('fails closed on routing failure while direct mentions remain usable', async () => {
    await setup(async () => {
      throw new Error('sensitive upstream detail');
    });
    const b = await bot(),
      g = await group([b]);
    await message(g, '普通问题');
    await expect
      .poll(async () => (await state()).messages.filter((m) => m.senderType === 'system').length)
      .toBe(1);
    expect(JSON.stringify(await state())).not.toContain('sensitive upstream detail');
    await message(g, '@Bob direct fallback');
    await expect.poll(() => jobs().length).toBe(1);
  });
  it('halts an agent-to-agent chain at its round limit', async () => {
    await setup(undefined, 2);
    const a = await bot('Alice'),
      b = await bot('Bob'),
      g = await group([a, b]);
    await message(g, '@Alice 方案');
    await expect.poll(() => jobs().length).toBe(1);
    finish(jobs()[0], '@Bob 请审查');
    await expect.poll(() => jobs().length).toBe(2);
    expect(jobs()[1].task.round).toBe(2);
    expect(jobs()[1].task.correlationId).toBe(jobs()[0].task.correlationId);
    finish(jobs()[1], '@Alice 请继续');
    await expect
      .poll(async () =>
        (await state()).messages.some((m) => m.content.includes('这轮讨论先停在这里')),
      )
      .toBe(true);
    expect(jobs()).toHaveLength(2);
  });
  it('enforces the independent call budget even before reaching the round limit', async () => {
    await setup();
    const a = await bot('Alice'),
      b = await bot('Bob'),
      g = await group([a, b]);
    await message(g, '@Alice 方案');
    await expect.poll(() => jobs().length).toBe(1);
    instance.store.db.prepare('UPDATE collaboration_chains SET max_calls=1').run();
    finish(jobs()[0], '@Bob 请审查');
    await expect
      .poll(async () =>
        (await state()).messages.some((m) => m.content.includes('这轮讨论先停在这里')),
      )
      .toBe(true);
    expect(jobs()).toHaveLength(1);
  });
  it('stops queued work, waits for native cancellation, and blocks completion-race handoffs', async () => {
    await setup();
    const a = await bot('Alice'),
      b = await bot('Bob'),
      g = await group([a, b]);
    await message(g, '@Alice first');
    await expect.poll(() => jobs().length).toBe(1);
    const j = jobs()[0];
    expect((await api('POST', `/api/chains/${j.task.correlationId}/stop`, {})).statusCode).toBe(
      200,
    );
    expect((await state()).tasks[0].status).toBe('cancelling');
    expect(commands.some((c) => c.type === 'cancel')).toBe(true);
    finish(j, '@Bob late completed output');
    expect((await state()).tasks[0].status).toBe('completed');
    expect(jobs()).toHaveLength(1);
  });
});
describe('bridge and approval authorization', () => {
  it('rejects client credentials on the bridge socket', async () => {
    await setup();
    const ws = await instance.app.injectWS('/bridge');
    const closed = new Promise<number>((resolve) => ws.on('close', resolve));
    ws.send(
      JSON.stringify({ type: 'hello', token, id: randomUUID(), name: 'forged', providers: [] }),
    );
    expect(await closed).toBe(1008);
  });
  it('allows one owner decision and rejects a stale approval after stop', async () => {
    await setup();
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob run');
    await expect.poll(() => jobs().length).toBe(1);
    const j = jobs()[0];
    event(j, {
      type: 'approval',
      requestId: '1',
      kind: 'command',
      detail: { command: 'echo hello', cwd: directory },
    });
    let approvals = (await state()).approvals!;
    expect(approvals).toHaveLength(1);
    expect(
      (await api('POST', `/api/approvals/${approvals[0].id}`, { decision: 'decline' })).statusCode,
    ).toBe(200);
    expect(
      (await api('POST', `/api/approvals/${approvals[0].id}`, { decision: 'accept' })).statusCode,
    ).toBe(409);
    event(j, { type: 'approval', requestId: '2', kind: 'file', detail: { reason: 'example' } });
    approvals = (await state()).approvals!;
    await api('POST', `/api/chains/${j.task.correlationId}/stop`, {});
    expect(
      (await api('POST', `/api/approvals/${approvals[1].id}`, { decision: 'accept' })).statusCode,
    ).toBe(409);
    event(j, { type: 'result', status: 'cancelled', text: '' });
  });
});
it('persists bindings and queued tasks through a service restart without replaying the running task', async () => {
  await setup();
  const b = await bot(),
    g = await group([b]);
  await message(g, '@Bob first');
  await message(g, '@Bob second');
  await expect.poll(() => jobs().length).toBe(1);
  event(jobs()[0], { type: 'session', threadId: 'durable-native-session' });
  await instance.app.close();
  commands = [];
  await setup();
  await expect.poll(() => jobs().length).toBe(1);
  const s = await state();
  expect(s.bots[0].bridgeId).toBe(bridgeId);
  expect(s.bots[0]).not.toHaveProperty('workingDirectory');
  expect(s.tasks.map((t) => t.status)).toEqual(['failed', 'running']);
  expect(jobs()[0].task.input).toBe('@Bob second');
  expect(jobs()[0].session?.threadId).toBe('durable-native-session');
});

function conversationalAgent() {
  return vi.fn<DialogueAgent>(async (input) => {
    const text = input.event.message?.content ?? '';
    const active = input.tasks.find((t) => ['queued', 'running', 'cancelling'].includes(t.status));
    if (input.event.kind === 'completion')
      return {
        decision: {
          action: 'reply',
          content: `结果回传：${input.event.task?.result ?? input.event.task?.status}`,
        },
        memory: input.memory,
      };
    if (text.includes('进度'))
      return { decision: { action: 'status', taskId: null }, memory: input.memory };
    if (text.includes('调整') && active)
      return { decision: { action: 'change', taskId: active.id }, memory: input.memory };
    if (text.includes('停止') && active)
      return { decision: { action: 'stop', taskId: active.id }, memory: input.memory };
    if (text.includes('开发'))
      return { decision: { action: 'task', goal: text }, memory: '已讨论任务；禁止改数据库' };
    return {
      decision: { action: 'reply', content: '我们可以继续讨论。' },
      memory: `${input.memory}对话更新`,
    };
  });
}
async function waitDialogue() {
  await expect
    .poll(() =>
      instance.store.db
        .prepare("SELECT count(*) AS n FROM dialogue_inbox WHERE status IN ('queued','processing')")
        .get(),
    )
    .toEqual({ n: 0 });
}
describe('persistent conversation and asynchronous task branches', () => {
  it('answers chat and factual progress while the same bot is executing, without creating more work', async () => {
    const agent = conversationalAgent();
    await setup(undefined, 6, agent);
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发登录功能，禁止改数据库');
    await expect.poll(() => jobs().length).toBe(1);
    const task = jobs()[0];
    event(task, { type: 'activity', text: '正在运行本地命令', report: '页面已接通，正在测试' });
    await message(g, '@Bob 进度怎么样？');
    await message(g, '@Bob 先聊聊设计想法');
    await waitDialogue();
    const s = await state();
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0].status).toBe('running');
    expect(
      s.messages.some((m) => m.senderType === 'bot' && m.content.includes('正在执行你交代的操作')),
    ).toBe(true);
    expect(s.messages.some((m) => m.content === '我们可以继续讨论。')).toBe(true);
    expect(agent.mock.calls.at(-1)?.[0].memory).toContain('禁止改数据库');
    const status = await api('GET', `/api/tasks/${task.task.id}/status`);
    expect(status.statusCode).toBe(200);
    expect(status.json().summary).toContain('页面已接通');
    expect(jobs()).toHaveLength(1);
  });
  it('pins task context at dispatch, creates independent task sessions, and returns results to the latest conversation', async () => {
    const agent = conversationalAgent();
    await setup(undefined, 6, agent);
    const b = await bot(),
      g = await group([b]);
    const firstMessage = await message(g, '@Bob 开发第一个功能');
    await expect.poll(() => jobs().length).toBe(1);
    const first = jobs()[0];
    event(first, { type: 'session', threadId: 'task-one-session' });
    await message(g, '@Bob 这是一条后来的讨论');
    await message(g, '@Bob 开发另外一个独立功能');
    await waitDialogue();
    expect((await state()).tasks.map((t) => t.status)).toEqual(['running', 'queued']);
    expect(first.task.execution?.contextMessageId).toBe(firstMessage.id);
    expect(first.messages.some((m) => m.content.includes('后来'))).toBe(false);
    finish(first, '第一个功能结果');
    await expect.poll(() => jobs().length).toBe(2);
    expect(jobs()[1].session).toBeNull();
    await waitDialogue();
    expect(agent.mock.calls.some(([i]) => i.event.kind === 'completion')).toBe(false);
    expect((await state()).messages.filter((m) => m.content === '第一个功能结果')).toHaveLength(1);
    finish(first, '重复完成不应该出现');
    await waitDialogue();
    expect((await state()).messages.some((m) => m.content.includes('重复完成'))).toBe(false);
  });
  it('waits for the old execution to exit before resuming with a new lease and confirmed requirements', async () => {
    await setup(undefined, 6, conversationalAgent());
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发功能');
    await expect.poll(() => jobs().length).toBe(1);
    const old = jobs()[0];
    event(old, { type: 'session', threadId: 'same-task-session' });
    await message(g, '@Bob 调整要求，暂时不要做退出登录');
    await waitDialogue();
    let t = (await state()).tasks[0];
    expect(t.status).toBe('cancelling');
    expect(t.execution?.version).toBe(1);
    expect(t.execution?.pendingChange?.instruction).toContain('不要做退出登录');
    expect(jobs()).toHaveLength(1);
    expect(commands.some((c) => c.type === 'cancel')).toBe(true);
    event(old, { type: 'result', status: 'cancelled', text: '' });
    await expect.poll(() => jobs().length).toBe(2);
    const resumed = jobs()[1];
    expect(resumed.task.id).toBe(old.task.id);
    expect(resumed.leaseId).not.toBe(old.leaseId);
    expect(resumed.session?.threadId).toBe('same-task-session');
    expect(resumed.task.execution?.version).toBe(2);
    expect(resumed.task.execution?.changes[0].instruction).toContain('不要做退出登录');
    expect(instance.store.db.prepare('SELECT status FROM task_changes').get()).toEqual({
      status: 'ready',
    });
    event(resumed, { type: 'started' });
    expect(instance.store.db.prepare('SELECT status FROM task_changes').get()).toEqual({
      status: 'accepted',
    });
    finish(old, '迟到的旧结果');
    expect((await state()).tasks[0].status).toBe('running');
    finish(resumed, '按 v2 完成');
    await waitDialogue();
    t = (await state()).tasks[0];
    expect(t.execution?.executedVersion).toBe(2);
    expect((await state()).messages.some((m) => m.content.includes('迟到的旧结果'))).toBe(false);
  });
  it('cancels a pending change when stopped and never resurrects the task after a racing completion', async () => {
    await setup(undefined, 6, conversationalAgent());
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发功能');
    await expect.poll(() => jobs().length).toBe(1);
    const job = jobs()[0];
    expect(
      (
        await api('POST', `/api/tasks/${job.task.id}/change`, {
          instruction: '不要改配置',
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(200);
    await api('POST', `/api/tasks/${job.task.id}/stop`, {});
    finish(job, '旧要求下的实际结果');
    await waitDialogue();
    expect(jobs()).toHaveLength(1);
    expect(instance.store.db.prepare('SELECT status FROM task_changes').get()).toEqual({
      status: 'cancelled',
    });
    expect((await state()).tasks[0].execution?.executedVersion).toBe(1);
  });
  it('rejects changes with a stale requirement version and applies queued changes before the first run', async () => {
    await setup(undefined, 6, conversationalAgent());
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发第一个功能');
    await message(g, '@Bob 开发第二个功能');
    await waitDialogue();
    const second = (await state()).tasks[1];
    expect(
      (
        await api('POST', `/api/tasks/${second.id}/change`, {
          instruction: '保留数据库结构',
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await api('POST', `/api/tasks/${second.id}/change`, {
          instruction: '旧版本请求',
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(409);
    finish(jobs()[0]);
    await expect.poll(() => jobs().length).toBe(2);
    expect(jobs()[1].task.execution?.version).toBe(2);
    expect(jobs()[1].task.execution?.changes[0].instruction).toBe('保留数据库结构');
  });
  it('serializes conversational turns and deduplicates delivery independently of the execution queue', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    const agent: DialogueAgent = async (input) => {
      calls++;
      if (calls === 1) await barrier;
      return {
        decision: { action: 'reply', content: input.event.message!.content },
        memory: input.event.message!.content,
      };
    };
    await setup(undefined, 6, agent);
    const b = await bot(),
      g = await group([b]);
    const id = randomUUID();
    await message(g, '@Bob 第一条', id);
    await message(g, '@Bob 第一条', id);
    await message(g, '@Bob 第二条');
    try {
      expect(calls).toBe(1);
    } finally {
      release();
    }
    await waitDialogue();
    expect(calls).toBe(2);
    expect(
      (await state()).messages.filter((m) => m.senderType === 'bot').map((m) => m.content),
    ).toEqual(['@Bob 第一条', '@Bob 第二条']);
    expect(jobs()).toHaveLength(0);
  });
  it('keeps group memory isolated and refuses a model-selected task owned by another group', async () => {
    let foreignId = '';
    const base = conversationalAgent();
    const inputs: DialogueInput[] = [];
    const agent: DialogueAgent = async (input, signal) => {
      inputs.push(input);
      if (input.event.message?.content.includes('越界'))
        return { decision: { action: 'stop', taskId: foreignId }, memory: '' };
      return base(input, signal);
    };
    await setup(undefined, 6, agent);
    const b = await bot(),
      a = await group([b], 'A'),
      other = await group([b], 'B');
    await message(a, '@Bob 开发保密功能');
    await expect.poll(() => jobs().length).toBe(1);
    foreignId = jobs()[0].task.id;
    await message(other, '@Bob 越界停止');
    await waitDialogue();
    expect(inputs.at(-1)?.memory).toBe('');
    expect(inputs.at(-1)?.tasks).toHaveLength(0);
    expect(inputs.at(-1)?.messages.every((m) => m.groupId === other)).toBe(true);
    expect((await state()).tasks[0].status).toBe('running');
    expect(commands.some((c) => c.type === 'cancel')).toBe(false);
  });
  it('falls back to a factual completion when dialogue fails and never executes a failed conversational decision', async () => {
    const base = conversationalAgent();
    let fail = false;
    await setup(undefined, 6, async (input, signal) => {
      if (fail) throw new Error('private upstream body');
      return base(input, signal);
    });
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发功能');
    await expect.poll(() => jobs().length).toBe(1);
    fail = true;
    await message(g, '@Bob 开发另一个功能');
    finish(jobs()[0], '工具核实的结果');
    await waitDialogue();
    const s = await state();
    expect(s.tasks).toHaveLength(1);
    expect(s.messages.some((m) => m.content.includes('工具核实的结果'))).toBe(true);
    expect(JSON.stringify(s)).not.toContain('private upstream body');
  });
  it('keeps memory, immutable queued snapshots and completion delivery across a restart', async () => {
    const base = conversationalAgent();
    await setup(undefined, 6, base);
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发第一个');
    await message(g, '@Bob 开发第二个');
    await waitDialogue();
    const first = jobs()[0];
    event(first, { type: 'session', threadId: 'do-not-reuse-for-new-task' });
    await instance.app.close();
    commands = [];
    await setup(undefined, 6, base);
    await expect.poll(() => jobs().length).toBe(1);
    expect(jobs()[0].session).toBeNull();
    expect(jobs()[0].task.input).toContain('第二个');
    await message(g, '@Bob 继续聊');
    await waitDialogue();
    expect(base.mock.calls.at(-1)?.[0].memory).toContain('禁止改数据库');
    finish(jobs()[0], '恢复后的结果');
    await waitDialogue();
    expect((await state()).messages.filter((m) => m.content === '恢复后的结果')).toHaveLength(1);
  });
});

it('recovers pending completion delivery exactly once without a model call or rerunning native work', async () => {
  const agent = conversationalAgent();
  await setup(undefined, 6, agent);
  const b = await bot(),
    g = await group([b]);
  await message(g, '@Bob 开发功能');
  await expect.poll(() => jobs().length).toBe(1);
  finish(jobs()[0], '重启前已核实完成');
  await waitDialogue();
  // Simulate a persisted completion whose delivery transaction has not yet committed.
  instance.store.db.transaction(() => {
    instance.store.db
      .prepare("DELETE FROM messages WHERE sender_type='bot' AND content=?")
      .run('重启前已核实完成');
    instance.store.db
      .prepare("UPDATE dialogue_inbox SET status='queued' WHERE kind LIKE 'completion:%'")
      .run();
  })();
  await instance.app.close();
  commands = [];
  agent.mockClear();
  await setup(undefined, 6, agent);
  await waitDialogue();
  expect(jobs()).toHaveLength(0);
  expect(agent).not.toHaveBeenCalled();
  expect((await state()).messages.filter((m) => m.content === '重启前已核实完成')).toHaveLength(1);
});

it('keeps native bot handoffs within the same bounded chain with dialogue enabled', async () => {
  await setup(undefined, 2, conversationalAgent());
  const a = await bot('Alice'),
    b = await bot('Bob'),
    g = await group([a, b]);
  await message(g, '@Bob 开发方案');
  await expect.poll(() => jobs().length).toBe(1);
  finish(jobs()[0], '@Alice 请检查方案');
  await expect.poll(() => jobs().length).toBe(2);
  expect(jobs()[1].task.botId).toBe(a);
  expect(jobs()[1].task.execution).toBeDefined();
  expect(jobs()[1].task.correlationId).toBe(jobs()[0].task.correlationId);
  finish(jobs()[1], '@Bob 请继续');
  await waitDialogue();
  expect(jobs()).toHaveLength(2);
  expect((await state()).messages.some((m) => m.content.includes('这轮讨论先停在这里'))).toBe(true);
});

it('does not hand off from a stopped single task even if native completion wins the cancellation race', async () => {
  await setup(undefined, 6, conversationalAgent());
  const a = await bot('Alice'),
    b = await bot('Bob'),
    g = await group([a, b]);
  await message(g, '@Bob 开发功能');
  await expect.poll(() => jobs().length).toBe(1);
  await api('POST', `/api/tasks/${jobs()[0].task.id}/stop`, {});
  finish(jobs()[0], '@Alice 迟到的协作请求');
  await waitDialogue();
  expect((await state()).tasks[0].status).toBe('completed');
  expect(jobs()).toHaveLength(1);
});

it('delivers ordinary questions and question-mark followups even if the router mistakes them for no work', async () => {
  const dialogue = conversationalAgent();
  await setup(
    async () => ({ action: 'ignore', botIds: [], reason: '询问状态，无需分配任务' }),
    6,
    dialogue,
  );
  const b = await bot(),
    g = await group([b]);
  await message(g, '你们现在有在做的事情吗');
  await expect.poll(() => dialogue.mock.calls.length).toBe(1);
  await waitDialogue();
  await message(g, '？');
  await expect.poll(() => dialogue.mock.calls.length).toBe(2);
  await waitDialogue();
  expect((await state()).messages.filter((m) => m.senderType === 'bot')).toHaveLength(2);
  expect(jobs()).toHaveLength(0);
  await message(g, '谢谢');
  await expect
    .poll(() =>
      instance.store.db
        .prepare('SELECT status FROM routing_decisions ORDER BY rowid DESC LIMIT 1')
        .get(),
    )
    .toEqual({ status: 'completed' });
  expect(dialogue).toHaveBeenCalledTimes(2);
});

it('can recover a previously ignored human message without replaying a delivered task or reply', async () => {
  const router: BrainRouter = async () => ({
    action: 'ignore',
    botIds: [],
    reason: 'old routing policy',
  });
  await setup(router);
  const b = await bot(),
    g = await group([b]);
  const original = await message(g, '你们现在有在做的事情吗');
  await expect
    .poll(() => instance.store.db.prepare('SELECT status FROM routing_decisions').get())
    .toEqual({ status: 'completed' });
  await instance.app.close();
  const dialogue = conversationalAgent();
  await setup(router, 6, dialogue);
  expect((await api('POST', `/api/messages/${original.id}/retry`, {})).json().retried).toBe(true);
  await expect.poll(() => dialogue.mock.calls.length).toBe(1);
  await waitDialogue();
  expect((await api('POST', `/api/messages/${original.id}/retry`, {})).json().retried).toBe(false);
  expect(
    (await state()).messages.filter((m) => m.senderType === 'bot' && m.replyTo === original.id),
  ).toHaveLength(1);
  expect(jobs()).toHaveLength(0);
});

it('keeps acknowledgments and progress conversational without exposing internal identifiers', async () => {
  await setup(undefined, 6, conversationalAgent());
  const b = await bot(),
    g = await group([b]);
  const request = await message(g, '@Bob 开发登录功能');
  await expect.poll(() => jobs().length).toBe(1);
  await waitDialogue();
  const job = jobs()[0];
  let s = await state();
  expect(s.messages.find((m) => m.replyTo === request.id && m.senderType === 'bot')?.content).toBe(
    '收到，我看看。',
  );
  event(job, {
    type: 'activity',
    text: '正在运行本地命令',
    report: '登录页面已经接好了，正在检查过期处理。',
  });
  const question = await message(g, '@Bob 进度怎么样');
  await waitDialogue();
  s = await state();
  const answer = s.messages.find(
    (m) => m.replyTo === question.id && m.senderType === 'bot',
  )!.content;
  expect(answer).toContain('登录页面已经接好了');
  expect(answer).not.toContain(job.task.id.slice(0, 8));
  expect(answer).not.toMatch(/要求版本|执行队列|任务编号|当前活动：|记录更新时间/);
});

it('never reconstructs a cancelled review from commentary or strengthens its tentative findings', async () => {
  const agent = conversationalAgent();
  await setup(undefined, 6, agent);
  const b = await bot(),
    g = await group([b]);
  await message(g, '@Bob 开发检查');
  await expect.poll(() => jobs().length).toBe(1);
  await waitDialogue();
  const report = '暂未发现明文凭据。我正在核对代码行号，尚未完成认证检查。';
  event(jobs()[0], { type: 'activity', text: '执行者正在处理任务', report });
  const before = agent.mock.calls.length;
  event(jobs()[0], { type: 'result', status: 'cancelled', text: '' });
  await waitDialogue();
  expect(agent.mock.calls.length).toBe(before);
  const reply = (await state()).messages.filter((m) => m.senderType === 'bot').at(-1)!.content;
  expect(reply).toContain('不是完整结论');
  expect(reply).toContain(report);
  expect(reply).not.toContain('已经排除');
  expect(reply).not.toContain('建议');
});

it('pins only selected relevant references instead of copying recent group history into new work', async () => {
  let reference = '';
  const agent: DialogueAgent = async (input) =>
    input.event.message!.content.includes('开发')
      ? {
          decision: {
            action: 'task',
            goal: '实现登录，保留既有接口',
            contextMessageIds: [reference],
          },
          memory: null,
        }
      : { decision: { action: 'reply', content: '收到' }, memory: null };
  await setup(undefined, 6, agent);
  const b = await bot(),
    g = await group([b]);
  await message(g, '@Bob 今天午饭吃什么');
  await waitDialogue();
  reference = (await message(g, '@Bob 登录沿用原来的接口')).id;
  await waitDialogue();
  const request = await message(g, '@Bob 开发登录功能');
  await expect.poll(() => jobs().length).toBe(1);
  expect(jobs()[0].messages.map((m) => m.id)).toEqual([reference, request.id]);
  expect(jobs()[0].messages.some((m) => m.content.includes('午饭'))).toBe(false);
});

it('continues finished work in its own native thread and advances the delivery cursor only on native acknowledgment', async () => {
  const base = conversationalAgent();
  const agent: DialogueAgent = async (input, signal) =>
    input.event.message?.content.includes('接着看')
      ? { decision: { action: 'continue', taskId: input.tasks[0].id }, memory: null }
      : base(input, signal);
  await setup(undefined, 6, agent);
  const b = await bot(),
    g = await group([b]);
  await message(g, '@Bob 开发原始要求');
  await expect.poll(() => jobs().length).toBe(1);
  const first = jobs()[0];
  event(first, { type: 'session', threadId: 'keep-this-conversation' });
  event(first, { type: 'started' });
  finish(first, '第一次的完整答复');
  await waitDialogue();
  await message(g, '@Bob 接着看，只检查缓存清理');
  await expect.poll(() => jobs().length).toBe(2);
  const next = jobs()[1];
  expect(next.task.id).toBe(first.task.id);
  expect(next.session?.threadId).toBe('keep-this-conversation');
  expect(next.acceptedVersion).toBe(1);
  expect(next.messages).toEqual([]);
  expect(next.task.execution?.changes.at(-1)?.instruction).toContain('只检查缓存清理');
  expect(
    instance.store.db.prepare('SELECT accepted_version FROM task_session_delivery').get(),
  ).toEqual({ accepted_version: 1 });
  event(next, { type: 'started' });
  expect(
    instance.store.db.prepare('SELECT accepted_version FROM task_session_delivery').get(),
  ).toEqual({ accepted_version: 2 });
});

it.each([true, false])(
  'renders native bot cards with coordinator=%s while keeping invalid output inert',
  async (coordinated) => {
    await setup(undefined, 6, coordinated ? conversationalAgent() : undefined);
    const b = await bot(),
      g = await group([b]);
    await message(g, '@Bob 开发交互卡片');
    await expect.poll(() => jobs().length).toBe(1);
    const document = {
      protocolVersion: 'opsique-ui/0.1',
      context: { threadId: '', viewId: 'new', revision: 1 },
      spec: {
        root: 'root',
        elements: { root: { type: 'Card', props: { title: '已检查的项目' }, children: [] } },
      },
      state: { data: {}, form: {}, ui: {} },
    };
    finish(jobs()[0], '这里可以继续选择。\n```opsique-ui\n' + JSON.stringify(document) + '\n```');
    await expect.poll(async () => (await state()).messages.filter((m) => m.ui).length).toBe(1);
    expect((await state()).messages.find((m) => m.ui)?.content).toBe('这里可以继续选择。');
    await message(g, '@Bob 开发下一张卡片');
    await expect.poll(() => jobs().length).toBe(2);
    const invalid = JSON.stringify({
      ...document,
      spec: { root: 'root', elements: { root: { type: 'script', props: {}, children: [] } } },
    });
    finish(jobs()[1], invalid);
    await waitDialogue();
    expect((await state()).messages.filter((m) => m.ui)).toHaveLength(1);
    expect(
      (await state()).messages.some((m) => m.senderType === 'bot' && m.content === invalid),
    ).toBe(true);
  },
);
