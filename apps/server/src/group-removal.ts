import type { Store } from './store.js';

/** Remove an idle group atomically, preserving Bot identities and Bot-scoped memory. */
export function removeGroup(store: Store, id: string) {
  const db = store.db;
  return db.transaction(() => {
    const group = db.prepare('SELECT id FROM groups WHERE id=?').get(id);
    const fail = (statusCode: number, message: string): never => {
      throw Object.assign(new Error(message), { statusCode });
    };
    if (!group) fail(404, '群组不存在');
    if (db.prepare('SELECT 1 FROM direct_chats WHERE group_id=?').get(id))
      fail(409, '单独聊天不能通过删除群组移除');
    if (
      db
        .prepare(
          "SELECT 1 FROM tasks WHERE group_id=? AND status IN ('queued','running','cancelling','reviewing') LIMIT 1",
        )
        .get(id)
    )
      fail(409, '群内还有正在处理的任务，请先停止任务后再删除群组');
    if (
      db
        .prepare("SELECT 1 FROM dialogue_inbox WHERE group_id=? AND status='processing' LIMIT 1")
        .get(id) ||
      db
        .prepare(
          "SELECT 1 FROM routing_decisions WHERE message_id IN (SELECT id FROM messages WHERE group_id=?) AND status='pending' LIMIT 1",
        )
        .get(id)
    )
      fail(409, '数字员工正在处理群内消息，请稍后再删除群组');

    // Delete children before parents, with foreign keys enabled throughout.
    db.prepare(
      'DELETE FROM coordinator_calls WHERE turn_id IN (SELECT c.id FROM coordinator_turns c JOIN dialogue_inbox i ON i.id=c.inbox_id WHERE i.group_id=?)',
    ).run(id);
    db.prepare(
      'DELETE FROM coordinator_turns WHERE inbox_id IN (SELECT id FROM dialogue_inbox WHERE group_id=?)',
    ).run(id);
    db.prepare('DELETE FROM dialogue_inbox WHERE group_id=?').run(id); // attention rows cascade
    db.prepare(
      'DELETE FROM ui_actions WHERE message_id IN (SELECT message_id FROM ui_documents WHERE group_id=?)',
    ).run(id);
    db.prepare('DELETE FROM ui_documents WHERE group_id=?').run(id);
    db.prepare(
      'DELETE FROM native_requests WHERE task_id IN (SELECT id FROM tasks WHERE group_id=?)',
    ).run(id);
    for (const table of [
      'worker_reports',
      'task_health',
      'worker_runs',
      'task_approvals',
      'task_changes',
      'task_session_delivery',
      'task_specs',
      'task_runtime',
      'task_workers',
      'task_pipeline_bindings',
    ])
      db.prepare(
        `DELETE FROM ${table} WHERE task_id IN (SELECT id FROM tasks WHERE group_id=?)`,
      ).run(id);
    db.prepare(
      'DELETE FROM pipeline_sessions WHERE pipeline_id IN (SELECT id FROM task_pipelines WHERE group_id=?)',
    ).run(id);
    db.prepare('DELETE FROM task_pipelines WHERE group_id=?').run(id);
    db.prepare('DELETE FROM tasks WHERE group_id=?').run(id);
    db.prepare('DELETE FROM conversation_memory WHERE group_id=?').run(id);
    db.prepare('DELETE FROM agent_sessions WHERE group_id=?').run(id);
    db.prepare('DELETE FROM bot_memory WHERE group_id=?').run(id);
    // A Bot keeps its own durable facts after leaving a group; remove only the deleted source reference.
    db.prepare(
      'UPDATE bot_memory SET source_message_id=NULL WHERE source_message_id IN (SELECT id FROM messages WHERE group_id=?)',
    ).run(id);
    db.prepare(
      'DELETE FROM routing_decisions WHERE message_id IN (SELECT id FROM messages WHERE group_id=?)',
    ).run(id);
    db.prepare('DELETE FROM messages WHERE group_id=?').run(id);
    db.prepare('DELETE FROM groups WHERE id=?').run(id); // membership rows cascade
    return { ok: true, id };
  })();
}
