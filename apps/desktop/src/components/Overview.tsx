import { Button } from '@heroui/react';
import { ArrowUpRight, Bot as BotIcon, ListTodo, Plus } from 'lucide-react';
import type { Bot, Group, Snapshot, Task, WorkGoal, WorkArtifact } from '@openbot/shared';
import { workActivity, conversationalText } from '@openbot/shared';
import { BotAvatar, EmptySmall, IconButton, Status } from './Primitives';
export const taskLabels: Record<Task['status'], string> = {
  queued: '稍后处理',
  running: '处理中',
  cancelling: '正在停止',
  completed: '已完成',
  reviewing: '正在检查',
  failed: '遇到问题',
  cancelled: '已停止',
};
export function GoalCard({
  goal,
  bot,
  artifacts = [],
}: {
  goal: WorkGoal;
  bot?: Bot;
  artifacts?: WorkArtifact[];
}) {
  const states = {
    active: '持续负责',
    waiting: '等待条件',
    needs_attention: '需要你决定',
    completed: '目标已完成',
    cancelled: '目标已停止',
  };
  const stages = {
    produced: '产物已登记',
    verified: '验证已记录',
    accepted: '负责人已接受',
    applied: '已应用到项目',
  };
  return (
    <div className={`task-card goal-card ${goal.state}`}>
      <div>
        <span className="task-state">{states[goal.state]}</span>
        <time>
          {new Date(goal.updatedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <p>{goal.title}</p>
      <small>
        <BotIcon size={12} />
        {bot?.name ?? '数字员工'}
      </small>
      <div className="task-progress">
        {!['completed', 'cancelled'].includes(goal.state) && goal.nextAction && (
          <p>下一步：{goal.nextAction}</p>
        )}
        {goal.nextCheckAt && <p>下次检查：{new Date(goal.nextCheckAt).toLocaleString('zh-CN')}</p>}
        {goal.deadline && <p>截止：{new Date(goal.deadline).toLocaleString('zh-CN')}</p>}
        {goal.attentionReason && (
          <p role="status" className="task-error">
            {goal.attentionReason}
          </p>
        )}
        {goal.delivery === 'applied' && <p>完成要求：交付内容已应用到目标项目</p>}
        {artifacts
          .filter((a) => a.goalId === goal.id)
          .map((a) => (
            <p key={a.id}>
              {a.title}：{stages[a.state]}
            </p>
          ))}
      </div>
    </div>
  );
}
export function TaskCard({
  task,
  bot,
  onStop,
}: {
  task: Task;
  bot?: Bot;
  onStop?: (id: string) => void;
}) {
  return (
    <div className={`task-card ${task.status}`}>
      <div>
        <span className={`task-state ${task.status}`}>{taskLabels[task.status]}</span>
        <time>
          {new Date(task.createdAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <p>{task.input}</p>
      <small>
        <BotIcon size={12} />
        {bot?.name ?? 'Agent'}
      </small>
      {task.execution && (
        <div className="task-progress">
          {task.execution.contract?.nextAction &&
            !['completed', 'cancelled'].includes(task.execution.contract.state) && (
              <p>下一步：{task.execution.contract.nextAction}</p>
            )}
          {task.execution.contract?.waitCondition && (
            <p>等待：{task.execution.contract.waitCondition}</p>
          )}
          {task.execution.contract?.nextWakeAt && (
            <p>下次检查：{new Date(task.execution.contract.nextWakeAt).toLocaleString('zh-CN')}</p>
          )}
          {task.execution.workspace && <p>改动保存在独立工作副本，尚未合入原项目。</p>}
          {task.execution.activity && <p>{workActivity(task.execution.activity)}</p>}
          {task.execution.report && <p>{conversationalText(task.execution.report, [task])}</p>}
          {task.execution.health &&
            [
              'waiting_device',
              'waiting_owner',
              'waiting_permission',
              'stalled',
              'unresponsive',
              'unknown',
              'blocked',
            ].includes(task.execution.health.state) && (
              <p
                role="status"
                className={
                  ['stalled', 'unresponsive', 'unknown', 'blocked'].includes(
                    task.execution.health.state,
                  )
                    ? 'task-error'
                    : undefined
                }
              >
                {workActivity(task.execution.health.detail)}
              </p>
            )}
          {task.execution.pendingChange && (
            <p className="task-error">
              {task.execution.pendingChange.status === 'interrupted'
                ? '刚才中断了，还没能按你补充的要求继续。'
                : '正在停下手头的操作，确认后按你的新要求继续。'}
            </p>
          )}
          <small>更新于 {new Date(task.execution.updatedAt).toLocaleTimeString('zh-CN')}</small>
        </div>
      )}
      {task.error && <p className="task-error">{task.error}</p>}
      {task.result && <p>{conversationalText(task.result, [task])}</p>}
      {onStop && ['queued', 'running', 'reviewing'].includes(task.status) && (
        <Button variant="danger-soft" size="sm" onPress={() => onStop(task.correlationId)}>
          停止处理
        </Button>
      )}
    </div>
  );
}
export function Overview({
  data,
  group,
  onMembers,
  onBridge,
  onBot,
  onStop,
  onApprove,
}: {
  data: Snapshot;
  group: Group;
  onMembers: () => void;
  onBridge: (bot?: Bot) => void;
  onBot: () => void;
  onStop: (id: string) => void;
  onApprove: (id: string, decision: 'accept' | 'decline') => Promise<void>;
}) {
  const bots = data.bots.filter((b) => group.botIds.includes(b.id));
  const tasks = data.tasks.filter((t) => t.groupId === group.id);
  const active = tasks.filter(
    (t) =>
      t.status === 'running' ||
      t.status === 'queued' ||
      t.status === 'cancelling' ||
      t.status === 'reviewing',
  );
  return (
    <aside className="overview">
      <div className="overview-heading">
        <span>协作概览</span>
        <span className="live-label">
          <i />
          LIVE
        </span>
      </div>
      <section className="overview-section">
        <div className="section-title">
          <h3>
            {group.directBotId ? '当前对话' : '一起工作'} <span>{bots.length + 1}</span>
          </h3>
          {!group.directBotId && (
            <IconButton label="管理群组成员" onPress={onMembers}>
              <Plus size={15} />
            </IconButton>
          )}
        </div>
        <div className="member human-member">
          <span className="human-avatar">我</span>
          <div>
            <strong>
              {data.user.name}
              <span>你</span>
            </strong>
            <small>Bot 所有者</small>
          </div>
          <span className="member-online" title="已连接" />
        </div>
        {bots.map((bot) => (
          <button key={bot.id} className="member bot-member" onClick={() => onBridge(bot)}>
            <BotAvatar bot={bot} />
            <div>
              <strong>
                {bot.name}
                <span>BOT</span>
              </strong>
              <small>本地执行能力</small>
            </div>
            <Status status={bot.status} />
          </button>
        ))}
        {!group.directBotId && (
          <button className="invite-bot" onClick={bots.length ? onMembers : onBot}>
            <Plus size={15} />
            {bots.length ? '管理数字员工' : '添加一位数字同事'}
            <ArrowUpRight size={14} />
          </button>
        )}
      </section>
      <section className="overview-section">
        <div className="section-title">
          <h3>
            正在处理 <span>{active.length}</span>
          </h3>
          <ListTodo size={15} />
        </div>
        {data.goals
          ?.filter(
            (g) =>
              !g.legacy && g.groupId === group.id && !['completed', 'cancelled'].includes(g.state),
          )
          .map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              bot={bots.find((b) => b.id === g.botId)}
              artifacts={data.artifacts}
            />
          ))}
        {active.length ? (
          active.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              bot={bots.find((b) => b.id === t.botId)}
              onStop={onStop}
            />
          ))
        ) : (
          <EmptySmall
            icon={<ListTodo size={21} />}
            title="一切从容，等待下一步"
            description="有新的进展，会显示在这里。"
          />
        )}
      </section>
      {data.approvals
        ?.filter((a) => a.status === 'pending' && tasks.some((t) => t.id === a.taskId))
        .map((a) => (
          <section className="overview-section approval-card" key={a.id}>
            <strong>需要所有者审批</strong>
            <p>{a.kind === 'command' ? '执行命令' : '修改文件'}</p>
            {a.detail.command && <pre>{a.detail.command}</pre>}
            {a.detail.cwd && <small>{a.detail.cwd}</small>}
            {a.detail.reason && <p>{a.detail.reason}</p>}
            <div>
              <Button
                size="sm"
                variant="danger-soft"
                onPress={() => void onApprove(a.id, 'decline')}
              >
                拒绝
              </Button>
              <Button
                size="sm"
                className="accent-button"
                onPress={() => void onApprove(a.id, 'accept')}
              >
                允许本次
              </Button>
            </div>
          </section>
        ))}
    </aside>
  );
}
