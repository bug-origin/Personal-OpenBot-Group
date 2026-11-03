import { randomUUID } from 'node:crypto';
import type { Message, Task } from '@openbot/shared';
import type { Store } from './store.js';
export type Delegation = {
  id: string;
  task_id: string;
  group_id: string;
  source_bot_id: string;
  target_bot_id: string;
  source_message_id: string;
  child_task_id: string | null;
  goal: string;
  criteria: string;
  state: string;
  result: string | null;
  expires_at: string;
};
type Notify = (
  botId: string,
  groupId: string,
  sourceId: string,
  kind: string,
  facts: object,
  taskId?: string,
) => void;

/** Direct peer-to-peer contracts. No group-level model makes ownership decisions. */
export class BotDelegations {
  constructor(
    private store: Store,
    private notify: Notify,
    private stop: (id: string) => void,
  ) {}
  get(id: string, botId: string) {
    const d = this.store.db
      .prepare('SELECT * FROM bot_delegations WHERE id=? AND (source_bot_id=? OR target_bot_id=?)')
      .get(id, botId, botId) as Delegation | undefined;
    if (!d) throw new Error('委托不存在或不属于你');
    return d;
  }
  list(botId: string, groupId: string) {
    return this.store.db
      .prepare(
        'SELECT id,task_id,source_bot_id,target_bot_id,child_task_id,goal,criteria,state,substr(result,1,2000) AS result,expires_at FROM bot_delegations d WHERE (source_bot_id=? OR target_bot_id=?) AND (group_id=? OR EXISTS(SELECT 1 FROM task_routes r JOIN tasks t ON t.id=r.task_id WHERE r.task_id IN (d.task_id,d.child_task_id) AND t.bot_id=? AND r.group_id=?)) ORDER BY created_at DESC LIMIT 24',
      )
      .all(botId, botId, groupId, botId, groupId);
  }
  visible(d: Delegation, botId: string, groupId: string) {
    if (d.group_id === groupId) return true;
    const taskId = botId === d.source_bot_id ? d.task_id : d.child_task_id;
    return Boolean(
      this.store.db
        .prepare(
          'SELECT 1 FROM task_routes r JOIN tasks t ON t.id=r.task_id WHERE r.task_id=? AND t.bot_id=? AND r.group_id=?',
        )
        .get(taskId, botId, groupId),
    );
  }
  offer(
    task: Task,
    target: string,
    goal: string,
    criteria: string[],
    source: Message,
    expiresAt?: string,
  ) {
    if (['cancelled', 'completed', 'failed'].includes(task.status))
      throw new Error('只能为尚在负责的工作请求协作');
    const members = this.store.snapshot().groups.find((g) => g.id === source.groupId)?.botIds ?? [];
    if (target === task.botId || !members.includes(target) || !members.includes(task.botId))
      throw new Error('只能委托当前群内的其他同事');
    const ancestors = this.store.db
      .prepare(
        'WITH RECURSIVE parents(bot,task) AS (SELECT source_bot_id,task_id FROM bot_delegations WHERE child_task_id=? UNION SELECT d.source_bot_id,d.task_id FROM bot_delegations d JOIN parents p ON d.child_task_id=p.task) SELECT bot FROM parents',
      )
      .all(task.id) as { bot: string }[];
    if (ancestors.some((a) => a.bot === target))
      throw new Error('不能把同一条工作链重新委托给上游负责人');
    const existing = this.store.db
      .prepare(
        "SELECT id FROM bot_delegations WHERE task_id=? AND target_bot_id=? AND goal=? AND state IN ('offered','accepted','submitted')",
      )
      .get(task.id, target, goal) as { id: string } | undefined;
    if (existing) return this.get(existing.id, task.botId);
    const expiry = expiresAt ? Date.parse(expiresAt) : Date.now() + 86400000;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('协作期限必须在未来');
    const active = this.store.db
      .prepare(
        "SELECT count(*) AS n FROM bot_delegations WHERE task_id=? AND state IN ('offered','accepted','submitted')",
      )
      .get(task.id) as { n: number };
    if (active.n >= 6) throw new Error('这项工作同时等待的协作已经达到上限');
    const id = randomUUID(),
      now = new Date().toISOString();
    this.store.db
      .prepare(
        'INSERT INTO bot_delegations(id,task_id,group_id,source_bot_id,target_bot_id,source_message_id,goal,criteria,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        task.id,
        source.groupId,
        task.botId,
        target,
        source.id,
        goal,
        JSON.stringify(criteria),
        new Date(expiry).toISOString(),
        now,
        now,
      );
    const d = this.get(id, task.botId);
    this.notify(target, source.groupId, source.id, `delegation:offer:${id}`, d);
    return d;
  }
  respond(
    d: Delegation,
    botId: string,
    decision: 'accept' | 'reject',
    reason: string,
    create: () => Task | undefined,
  ) {
    if (d.target_bot_id !== botId) throw new Error('只有接收方能接受或拒绝委托');
    if (d.state !== 'offered') throw new Error('这项委托已经处理或撤销');
    if (Date.parse(d.expires_at) <= Date.now()) throw new Error('这项委托已过期');
    let child: Task | undefined;
    if (decision === 'accept') {
      child = create();
      if (!child) throw new Error('当前不能接下工作，委托仍保留为待接受');
    }
    const state = decision === 'accept' ? 'accepted' : 'rejected';
    this.store.db
      .prepare(
        'UPDATE bot_delegations SET state=?,child_task_id=?,result=?,updated_at=? WHERE id=?',
      )
      .run(state, child?.id ?? null, reason, new Date().toISOString(), d.id);
    this.notify(
      d.source_bot_id,
      d.group_id,
      d.source_message_id,
      `delegation:${state}:${d.id}`,
      { ...d, state, child_task_id: child?.id, reason },
      d.task_id,
    );
    return { state, childTaskId: child?.id };
  }
  submit(task: Task) {
    const d = this.store.db
      .prepare("SELECT * FROM bot_delegations WHERE child_task_id=? AND state='accepted'")
      .get(task.id) as Delegation | undefined;
    if (!d) return;
    this.store.db
      .prepare("UPDATE bot_delegations SET state='submitted',result=?,updated_at=? WHERE id=?")
      .run(task.result, new Date().toISOString(), d.id);
    this.notify(
      d.source_bot_id,
      d.group_id,
      d.source_message_id,
      `delegation:result:${d.id}:${task.execution?.version}`,
      { ...d, state: 'submitted', result: task.result },
      d.task_id,
    );
  }
  outcome(task: Task, runId: string) {
    if (!['failed', 'cancelled'].includes(task.status)) return;
    const d = this.store.db
      .prepare("SELECT * FROM bot_delegations WHERE child_task_id=? AND state='accepted'")
      .get(task.id) as Delegation | undefined;
    if (!d) return;
    if (task.status === 'cancelled') {
      this.cancel(task.id);
      return;
    }
    this.notify(
      d.source_bot_id,
      d.group_id,
      d.source_message_id,
      `delegation:blocked:${d.id}:${runId}`,
      { ...d, childStatus: task.status, error: task.error, result: task.result },
      d.task_id,
    );
  }
  review(d: Delegation, botId: string, accept: boolean, feedback: string) {
    if (d.source_bot_id !== botId || d.state !== 'submitted')
      throw new Error('只有发起方能验收已提交的协作结果');
    const child = this.store.snapshot().tasks.find((t) => t.id === d.child_task_id);
    if (!child || child.status !== 'completed') throw new Error('协作方的执行尚未验收完成');
    this.store.db
      .prepare('UPDATE bot_delegations SET state=?,updated_at=? WHERE id=?')
      .run(accept ? 'completed' : 'accepted', new Date().toISOString(), d.id);
    if (!accept)
      this.notify(
        d.target_bot_id,
        d.group_id,
        d.source_message_id,
        `delegation:rework:${d.id}:${child.execution?.version}`,
        { ...d, feedback, state: 'accepted' },
        child.id,
      );
    return { state: accept ? 'completed' : 'accepted' };
  }
  cancel(taskId: string, state: 'cancelled' | 'expired' = 'cancelled') {
    // A colleague can stop its own assignment; the requester must not wait until expiry.
    const incoming = this.store.db
      .prepare(
        "SELECT * FROM bot_delegations WHERE child_task_id=? AND state IN ('accepted','submitted')",
      )
      .get(taskId) as Delegation | undefined;
    if (incoming) {
      this.store.db
        .prepare('UPDATE bot_delegations SET state=?,updated_at=? WHERE id=?')
        .run(state, new Date().toISOString(), incoming.id);
      this.notify(
        incoming.source_bot_id,
        incoming.group_id,
        incoming.source_message_id,
        `delegation:${state}:${incoming.id}`,
        { ...incoming, state },
        incoming.task_id,
      );
    }
    const rows = this.store.db
      .prepare(
        "SELECT * FROM bot_delegations WHERE task_id=? AND state IN ('offered','accepted','submitted')",
      )
      .all(taskId) as Delegation[];
    for (const d of rows) {
      this.store.db
        .prepare('UPDATE bot_delegations SET state=?,updated_at=? WHERE id=?')
        .run(state, new Date().toISOString(), d.id);
      if (d.child_task_id) this.stop(d.child_task_id);
      this.notify(
        d.target_bot_id,
        d.group_id,
        d.source_message_id,
        `delegation:${state}:${d.id}`,
        { ...d, state },
        d.child_task_id ?? undefined,
      );
    }
  }
  scan(now: number) {
    const rows = this.store.db
      .prepare(
        "SELECT * FROM bot_delegations WHERE state IN ('offered','accepted','submitted') AND expires_at<=?",
      )
      .all(new Date(now).toISOString()) as Delegation[];
    for (const d of rows) {
      this.store.db
        .prepare("UPDATE bot_delegations SET state='expired',updated_at=? WHERE id=?")
        .run(new Date(now).toISOString(), d.id);
      if (d.child_task_id) this.stop(d.child_task_id);
      this.notify(
        d.source_bot_id,
        d.group_id,
        d.source_message_id,
        `delegation:expired:${d.id}`,
        { ...d, state: 'expired' },
        d.task_id,
      );
    }
  }
}
