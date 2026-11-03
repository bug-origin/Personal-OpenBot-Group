import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../apps/server/src/store';

it('upgrades populated version-13 work without losing identity, source, native session or memory and reopens idempotently', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openbot-migration-'));
  const path = join(directory, 'db.sqlite');
  let db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    const migrations = new URL('../apps/server/migrations/', import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((f) => /^\d+.*\.sql$/.test(f) && Number(f.slice(0, 3)) <= 13)
      .sort())
      db.transaction(() => db.exec(readFileSync(new URL(file, migrations), 'utf8')))();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO bots(id,owner_id,name,description,provider,created_at) VALUES('b','owner','BB','','codex',?)",
    ).run(now);
    db.prepare("INSERT INTO groups VALUES('g','项目群','',?)").run(now);
    db.prepare("INSERT INTO group_bots VALUES('g','b')").run();
    db.prepare(
      "INSERT INTO messages(id,group_id,sender_id,sender_type,content,timestamp,message_type) VALUES('m','g','owner','human','持续负责',?,'text')",
    ).run(now);
    db.prepare(
      "INSERT INTO tasks(id,group_id,bot_id,input,status,created_at,correlation_id) VALUES('t','g','b','持续负责','completed',?,'chain')",
    ).run(now);
    db.prepare("INSERT INTO task_runtime(task_id,source_message_id) VALUES('t','m')").run();
    db.prepare(
      "INSERT INTO task_specs(task_id,goal,context_message_id,context,updated_at) VALUES('t','持续负责','m','[]',?)",
    ).run(now);
    db.prepare(
      "INSERT INTO task_workers(task_id,provider,resource_key) VALUES('t','codex','*')",
    ).run();
    db.prepare("INSERT INTO task_pipelines VALUES('p','b','g','持续负责',?,NULL)").run(now);
    db.prepare("INSERT INTO task_pipeline_bindings VALUES('t','p')").run();
    db.prepare("INSERT INTO pipeline_sessions VALUES('p','codex','device','native-thread',?)").run(
      now,
    );
    db.prepare(
      "INSERT INTO bot_memory(id,bot_id,scope,key,content,source_message_id,updated_at) VALUES('memory','b','bot','preference','偏好中文','m',?)",
    ).run(now);
    db.close();
    let store = createStore(path);
    db = store.db;
    expect(store.snapshot().tasks).toContainEqual(
      expect.objectContaining({
        id: 't',
        groupId: 'g',
        execution: expect.objectContaining({
          pipeline: { id: 'p', title: '持续负责' },
          contract: expect.objectContaining({ state: 'completed' }),
        }),
      }),
    );
    expect(db.prepare('SELECT * FROM task_routes').get()).toEqual({
      task_id: 't',
      group_id: 'g',
      source_message_id: 'm',
    });
    expect(db.prepare('SELECT thread_id FROM pipeline_sessions').get()).toEqual({
      thread_id: 'native-thread',
    });
    expect(db.prepare('SELECT content,source_message_id,state FROM bot_memory').get()).toEqual({
      content: '偏好中文',
      source_message_id: 'm',
      state: 'active',
    });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
    store = createStore(path);
    db = store.db;
    expect(db.prepare('SELECT count(*) AS n FROM task_conversations').get()).toEqual({ n: 1 });
    expect(
      db.prepare('SELECT count(*) AS n FROM schema_migrations WHERE version=14').get(),
    ).toEqual({ n: 1 });
    expect(store.snapshot().bots).toHaveLength(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
