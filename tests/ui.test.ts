import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/server/src/app';
import type { RenderDocument, ActionEnvelope } from '@openbot/shared/ui/types';
import type { BrainRouter } from '../apps/server/src/brain';
import { uiFromText } from '../apps/server/src/ui';
const token = 'ui-tests-owner-token-0000000000000';
let dir: string, instance: Awaited<ReturnType<typeof createApp>>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openbot-ui-'));
});
afterEach(async () => {
  await instance?.app.close();
  rmSync(dir, { recursive: true, force: true });
});
async function setup(brain?: BrainRouter) {
  instance = await createApp({
    databasePath: join(dir, 'db.sqlite'),
    token,
    brain,
    dialogue: async () => ({ decision: { action: 'reply', content: '收到' }, memory: null }),
  });
  await instance.app.ready();
}
async function api(path: string, body?: unknown) {
  return instance.app.inject({
    method: body ? 'POST' : 'GET',
    url: path,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}
async function bot(name = 'Bob') {
  return (await api('/api/bots', { name, provider: 'codex' })).json().id as string;
}
async function group(botIds: string[]) {
  return (await api('/api/groups', { name: 'UI test', botIds })).json().id as string;
}
function form(): RenderDocument {
  return {
    protocolVersion: 'opsique-ui/0.1',
    context: { threadId: '', viewId: 'new', revision: 1 },
    spec: {
      root: 'root',
      elements: {
        root: {
          type: 'Card',
          props: { title: '补充一下要看的范围' },
          children: ['name', 'submit'],
        },
        name: {
          type: 'TextField',
          props: { label: '范围', required: true, value: { $bindState: '/form/name' } },
          children: [],
        },
        submit: {
          type: 'Button',
          props: { label: '就看这些' },
          children: [],
          on: {
            press: {
              action: 'submitForm',
              params: { actionId: 'reply', input: { $state: '/form' } },
            },
          },
        },
      },
    },
    state: { data: { immutable: 'server' }, form: { name: '' }, ui: {} },
  };
}
function submission(document: RenderDocument, name = '登录流程'): ActionEnvelope {
  return {
    requestId: randomUUID(),
    context: document.context,
    componentId: 'submit',
    instanceId: 'root/submit',
    event: 'press',
    action: 'submitForm',
    params: { actionId: 'reply', input: { name } },
  };
}
it.each(['opsique-ui', 'opsique-ui/0.1', 'openbot-ui'])(
  'accepts a valid native document fenced as %s',
  (language) => {
    const parsed = uiFromText(
      '请选一下。\n```' + language + '\n' + JSON.stringify(form()) + '\n```',
    );
    expect(parsed?.document.protocolVersion).toBe('opsique-ui/0.1');
    expect(parsed?.content).toBe('请选一下。');
  },
);
it('publishes a real document, validates the form on the server, and consumes a submission once', async () => {
  await setup();
  const b = await bot(),
    g = await group([b]);
  const posted = await api(`/api/groups/${g}/cards`, { botId: b, document: form() });
  expect(posted.statusCode).toBe(201);
  const card = posted.json();
  expect(card.document.context.threadId).toBe(g);
  expect(
    (await api(`/api/cards/${card.messageId}/actions`, submission(card.document, ''))).statusCode,
  ).toBe(400);
  const action = submission(card.document);
  const first = await api(`/api/cards/${card.messageId}/actions`, action);
  expect(first.statusCode).toBe(200);
  expect((await api(`/api/cards/${card.messageId}/actions`, action)).json()).toEqual(first.json());
  expect(
    (await api(`/api/cards/${card.messageId}/actions`, { ...action, requestId: randomUUID() }))
      .statusCode,
  ).toBe(409);
  const s = (await api('/api/snapshot')).json();
  expect(s.messages.filter((m: { senderType: string }) => m.senderType === 'human')).toHaveLength(
    1,
  );
  expect(s.messages.find((m: { id: string }) => m.id === card.messageId).ui.status).toBe(
    'submitted',
  );
  expect(
    s.messages.find((m: { id: string }) => m.id === card.messageId).ui.document.state.form.name,
  ).toBe('登录流程');
  expect(
    s.messages.find((m: { senderType: string }) => m.senderType === 'human').content,
  ).toContain('范围：登录流程');
});
it('rejects forged action parameters, stale revisions, unavailable components and unknown host actions', async () => {
  await setup();
  const b = await bot(),
    g = await group([b]);
  const card = (await api(`/api/groups/${g}/cards`, { botId: b, document: form() })).json();
  const action = submission(card.document);
  expect(
    (
      await api(`/api/cards/${card.messageId}/actions`, {
        ...action,
        context: { ...action.context, threadId: 'another-group' },
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await api(`/api/cards/${card.messageId}/actions`, {
        ...action,
        params: { ...action.params, actionId: 'execute_command' },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await api(`/api/cards/${card.messageId}/actions`, {
        ...action,
        instanceId: 'root/hidden/submit',
      })
    ).statusCode,
  ).toBe(400);
  const malicious = form();
  malicious.spec.elements.submit.on!.press.params.actionId = 'https://untrusted.invalid';
  expect((await api(`/api/groups/${g}/cards`, { botId: b, document: malicious })).statusCode).toBe(
    400,
  );
  const newer = structuredClone(card.document);
  newer.context.revision = 2;
  expect((await api(`/api/groups/${g}/cards`, { botId: b, document: newer })).statusCode).toBe(201);
  expect((await api(`/api/cards/${card.messageId}/actions`, action)).statusCode).toBe(409);
});
it('turns a routing clarification into a choice card and dispatches only to selected current group members', async () => {
  let candidates: string[] = [];
  await setup(async () => ({ action: 'clarify', botIds: candidates, reason: '职责重叠' }));
  const a = await bot('Bob'),
    b = await bot('Alice'),
    g = await group([a, b]);
  candidates = [a, b];
  await api('/api/messages', {
    id: randomUUID(),
    groupId: g,
    content: '我没想好让谁来做，你们给个选择',
  });
  await expect.poll(() => instance.store.snapshot().messages.filter((m) => m.ui).length).toBe(1);
  const card = instance.store.snapshot().messages.find((m) => m.ui)!;
  const doc = card.ui!.document;
  const response = await api(`/api/cards/${card.id}/actions`, {
    requestId: randomUUID(),
    context: doc.context,
    componentId: 'choice-1',
    instanceId: 'root/choices/choice-1',
    event: 'press',
    action: 'dispatch',
    params: { actionId: 'choose_bots', optionId: b },
  });
  expect(response.statusCode).toBe(200);
  const human = instance.store.snapshot().messages.find((m) => m.id === response.json().messageId)!;
  expect(human.mentions).toEqual([b]);
  expect(human.content).toContain('Alice');
  expect(instance.store.snapshot().tasks).toHaveLength(0);
});
it('renders coordinator-produced documents as cards instead of raw JSON in chat', async () => {
  instance = await createApp({
    databasePath: join(dir, 'db.sqlite'),
    token,
    dialogue: vi.fn(async () => ({
      decision: { action: 'render', document: form() },
      memory: null,
    })),
  });
  const b = await bot(),
    g = await group([b]);
  await api('/api/messages', {
    id: randomUUID(),
    groupId: g,
    content: '@Bob 给我一个可填写的范围选择',
  });
  await expect.poll(() => instance.store.snapshot().messages.filter((m) => m.ui).length).toBe(1);
  expect(instance.store.snapshot().tasks).toHaveLength(0);
  expect(instance.store.snapshot().messages.find((m) => m.ui)?.content).toBe('补充一下要看的范围');
});
