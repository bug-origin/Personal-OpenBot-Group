import { randomUUID } from 'node:crypto';
import { conversationalText, workProgress, type Message, type Task } from '@openbot/shared';
import type { Store } from './store.js';
import { type DialogueAgent } from './dialogue.js';

type Inbox = {
  id: string;
  bot_id: string;
  group_id: string;
  source_message_id: string | null;
  task_id: string | null;
  kind: string;
  payload: string;
};
export class Conversations {
  private controller = new AbortController();
  private running = new Map<string, Promise<void>>();
  private closed = false;
  constructor(
    private store: Store,
    private changed: () => void,
    private agent: DialogueAgent,
    private hooks: {
      create: (
        message: Message,
        botId: string,
        goal: string,
        contextIds?: string[],
      ) => Task | undefined;
      change: (taskId: string, instruction: string, version: number, sourceId: string) => unknown;
      stop: (taskId: string) => void;
      continue: (taskId: string, message: Message, version: number) => void;
      render: (message: Message, botId: string, document: unknown) => unknown;
    },
  ) {}
  start() {
    this.pump();
  }
  receive(message: Message, botId: string) {
    this.store.db
      .prepare(
        "INSERT OR IGNORE INTO dialogue_inbox(id,bot_id,group_id,source_message_id,kind,created_at) VALUES(?,?,?,?,'message',?)",
      )
      .run(randomUUID(), botId, message.groupId, message.id, new Date().toISOString());
    queueMicrotask(() => this.pump());
  }
  complete(task: Task, leaseId: string) {
    const source = this.store.db
      .prepare('SELECT source_message_id FROM task_runtime WHERE task_id=?')
      .get(task.id) as { source_message_id: string };
    this.store.db
      .prepare(
        'INSERT OR IGNORE INTO dialogue_inbox(id,bot_id,group_id,task_id,kind,payload,created_at) VALUES(?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        task.botId,
        task.groupId,
        task.id,
        `completion:${leaseId}`,
        JSON.stringify({ ...task, replyToMessageId: source.source_message_id }),
        new Date().toISOString(),
      );
    queueMicrotask(() => this.pump());
  }
  private pump() {
    if (this.closed) return;
    const rows = this.store.db
      .prepare("SELECT * FROM dialogue_inbox WHERE status='queued' ORDER BY rowid")
      .all() as Inbox[];
    for (const row of rows) {
      const key = `${row.bot_id}:${row.group_id}`;
      if (this.running.has(key)) continue;
      this.store.db.prepare("UPDATE dialogue_inbox SET status='processing' WHERE id=?").run(row.id);
      const work = this.process(row).finally(() => {
        this.running.delete(key);
        this.changed();
        this.pump();
      });
      this.running.set(key, work);
      this.changed();
    }
  }
  private reply(row: Inbox, content: string) {
    const completed =
      row.kind !== 'message'
        ? (JSON.parse(row.payload) as Task & { replyToMessageId?: string })
        : undefined;
    const source =
      row.source_message_id ??
      completed?.replyToMessageId ??
      (row.task_id
        ? (
            this.store.db
              .prepare('SELECT source_message_id FROM task_runtime WHERE task_id=?')
              .get(row.task_id) as { source_message_id: string } | undefined
          )?.source_message_id
        : null);
    const task = row.task_id
      ? this.store.snapshot().tasks.find((t) => t.id === row.task_id)
      : undefined;
    const message = source
      ? this.store.snapshot().messages.find((m) => m.id === source)
      : undefined;
    this.store.insertMessage({
      id: randomUUID(),
      groupId: row.group_id,
      senderId: row.bot_id,
      senderType: 'bot',
      content: conversationalText(content, this.store.snapshot().tasks),
      mentions: [],
      replyTo: source ?? null,
      timestamp: new Date().toISOString(),
      messageType: 'text',
      correlationId:
        completed?.correlationId ?? task?.correlationId ?? message?.correlationId ?? null,
    });
  }
  private async process(row: Inbox) {
    const s = this.store.snapshot();
    const bot = s.bots.find((b) => b.id === row.bot_id);
    const group = s.groups.find((g) => g.id === row.group_id);
    if (!bot || !group?.botIds.includes(bot.id)) {
      this.store.db.prepare("UPDATE dialogue_inbox SET status='discarded' WHERE id=?").run(row.id);
      return;
    }
    const source = s.messages.find((m) => m.id === row.source_message_id);
    const completion = row.kind !== 'message' ? (JSON.parse(row.payload) as Task) : undefined;
    if (completion) {
      // Final output belongs to the executor. Never ask another model to reconstruct it
      // from a progress note, or to strengthen tentative findings into confirmed results.
      let content: string;
      if (completion.status === 'completed')
        content = completion.result?.trim() || '这边已结束，但没有收到完整的答复。';
      else {
        content =
          completion.status === 'cancelled'
            ? '我这边已经停下来了，还没有完成。'
            : `这边中断了，还没有完成。${completion.error ? `\n${completion.error}` : ''}`;
        if (completion.execution?.report)
          content += `\n\n中断前最后一条进度（不是完整结论）：\n${completion.execution.report
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')}`;
        if (completion.result?.trim()) content += `\n\n中断前返回的内容：\n${completion.result}`;
      }
      this.store.db.transaction(() => {
        this.reply(row, content);
        this.store.db
          .prepare("UPDATE dialogue_inbox SET status='delivered' WHERE id=?")
          .run(row.id);
      })();
      return;
    }
    const memory =
      (
        this.store.db
          .prepare('SELECT summary FROM conversation_memory WHERE bot_id=? AND group_id=?')
          .get(bot.id, group.id) as { summary: string } | undefined
      )?.summary ?? '';
    let messages = s.messages.filter((m) => m.groupId === group.id);
    if (source) messages = messages.slice(0, messages.findIndex((m) => m.id === source.id) + 1);
    try {
      const result = await this.agent(
        {
          bot,
          group,
          messages,
          memory,
          tasks: s.tasks.filter((t) => t.botId === bot.id && t.groupId === group.id),
          event: { kind: 'message', message: source },
        },
        this.controller.signal,
      );
      if (this.closed) return;
      this.store.db.transaction(() => {
        // Membership and chain cancellation may have changed while the model was replying.
        if (
          !this.store
            .snapshot()
            .groups.find((g) => g.id === group.id)
            ?.botIds.includes(bot.id)
        ) {
          this.store.db
            .prepare("UPDATE dialogue_inbox SET status='discarded' WHERE id=?")
            .run(row.id);
          return;
        }
        const d = result.decision;
        const scopedTasks = this.store
          .snapshot()
          .tasks.filter((t) => t.botId === bot.id && t.groupId === group.id);
        if ('taskId' in d && d.taskId && !scopedTasks.some((t) => t.id === d.taskId))
          throw new Error('任务不在当前会话范围');
        let content: string | null;
        if (d.action === 'reply') content = d.content;
        else if (d.action === 'render' && source) {
          this.hooks.render(source, bot.id, d.document);
          content = null;
        } else if (d.action === 'task' && source) {
          const task = this.hooks.create(source, bot.id, d.goal, d.contextMessageIds);
          content = task
            ? scopedTasks.some((t) => ['running', 'cancelling', 'queued'].includes(t.status))
              ? '收到，我先记着，手头的事情处理完就看。'
              : '收到，我看看。'
            : '这件事暂时还没能开始，我需要先确认一下本地连接和当前状态。';
        } else if (d.action === 'status') {
          let tasks = d.taskId
            ? scopedTasks.filter((t) => t.id === d.taskId)
            : scopedTasks.filter((t) => ['queued', 'running', 'cancelling'].includes(t.status));
          content = tasks.length
            ? tasks
                .map(
                  (task) =>
                    `${
                      tasks.length > 1
                        ? `关于“${task.input
                            .replace(/@[\p{L}\p{N}_-]+/gu, '')
                            .trim()
                            .slice(0, 60)}”：\n`
                        : ''
                    }${workProgress(task)}`,
                )
                .join('\n\n')
            : '我现在没有正在处理的事情，有需要直接说。';
        } else if (d.action === 'change' && source) {
          const task = scopedTasks.find((t) => t.id === d.taskId)!;
          if (!task.execution) content = '这件事需要先停下来，再按你的新要求重新处理。';
          else {
            this.hooks.change(task.id, source.content, task.execution.version, source.id);
            content =
              task.status === 'queued'
                ? '收到，等开始处理时，我会按你刚说的来。'
                : '收到，我先停下手头的操作，确认后按你刚说的来。';
          }
        } else if (d.action === 'continue' && source) {
          const task = scopedTasks.find((t) => t.id === d.taskId)!;
          if (!task.execution) content = '之前的记录无法直接接着处理，麻烦再说明一下这次要看什么。';
          else {
            this.hooks.continue(task.id, source, task.execution.version);
            content = '收到，我接着看。';
          }
        } else if (d.action === 'stop') {
          this.hooks.stop(d.taskId);
          const task = this.store.snapshot().tasks.find((t) => t.id === d.taskId)!;
          content =
            task.status === 'cancelled'
              ? '好，这件事先不做了。'
              : task.status === 'cancelling'
                ? '好，我正在停下手头的操作，停稳后告诉你。'
                : workProgress(task);
        } else throw new Error('无效对话动作');
        if (content !== null) this.reply(row, content);
        if (result.memory?.trim())
          this.store.db
            .prepare(
              'INSERT INTO conversation_memory VALUES(?,?,?,?) ON CONFLICT(bot_id,group_id) DO UPDATE SET summary=excluded.summary,updated_at=excluded.updated_at',
            )
            .run(bot.id, group.id, result.memory.slice(0, 4000), new Date().toISOString());
        this.store.db
          .prepare("UPDATE dialogue_inbox SET status='delivered' WHERE id=?")
          .run(row.id);
      })();
    } catch {
      if (this.closed) return;
      if (
        !this.store
          .snapshot()
          .groups.find((g) => g.id === group.id)
          ?.botIds.includes(bot.id)
      ) {
        this.store.db
          .prepare("UPDATE dialogue_inbox SET status='discarded' WHERE id=?")
          .run(row.id);
        return;
      }
      this.store.db.transaction(() => {
        // A completion must remain visible even if the conversational provider is unavailable.
        const content = '刚才没能处理好这条消息，麻烦再说一次。';
        this.reply(row, content);
        this.store.db.prepare("UPDATE dialogue_inbox SET status='failed' WHERE id=?").run(row.id);
      })();
    }
  }
  async close() {
    this.closed = true;
    this.controller.abort();
    await Promise.allSettled([...this.running.values()]);
  }
}
