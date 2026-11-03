import { useState } from 'react';
import { Button } from '@heroui/react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot as BotIcon,
  Hash,
  Link2,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Bot, Snapshot } from '@openbot/shared';
import { BotAvatar, Dialog, EmptySmall, Status } from './Primitives';
import { TaskCard } from './Overview';
export function BotsView({
  data,
  onCreate,
  onBridge,
  onChat,
}: {
  data: Snapshot;
  onCreate: () => void;
  onBridge: (bot: Bot) => void;
  onChat: (bot: Bot) => void;
}) {
  return (
    <div className="page-view">
      <div className="page-eyebrow">YOUR DIGITAL TEAM</div>
      <div className="page-title">
        <div>
          <h1>数字员工</h1>
          <p>不同的能力，相同的目标。认识你的 AI 协作伙伴。</p>
        </div>
        <Button className="accent-button" onPress={onCreate}>
          <Plus size={17} />
          创建 Bot
        </Button>
      </div>
      <div className="stats-strip">
        <div>
          <BotIcon size={18} />
          <span>数字员工</span>
          <strong>{data.bots.length}</strong>
        </div>
        <div>
          <span className="green-dot" />
          <span>在线</span>
          <strong>{data.bots.filter((b) => b.status !== 'offline').length}</strong>
        </div>
        <div>
          <Activity size={17} />
          <span>执行中</span>
          <strong>{data.tasks.filter((t) => t.status === 'running').length}</strong>
        </div>
      </div>
      {data.bots.length ? (
        <div className="bot-grid">
          {data.bots.map((bot, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="bot-profile"
              key={bot.id}
            >
              <div className="bot-profile-top">
                <BotAvatar bot={bot} size="large" />
                <Status status={bot.status} />
              </div>
              <h2>{bot.name}</h2>
              <span className="provider-tag">本地能力</span>
              <p>{bot.description || '这位数字员工的故事，等你来定义。'}</p>
              <div className="bot-profile-groups">
                <Hash size={13} />
                {data.groups.filter((g) => !g.directBotId && g.botIds.includes(bot.id)).length}{' '}
                个协作群组
              </div>
              <Button className="accent-button" fullWidth onPress={() => onChat(bot)}>
                <MessageSquare size={15} />
                单独聊天
                <ArrowRight size={15} />
              </Button>
              <Button variant="outline" fullWidth onPress={() => onBridge(bot)}>
                <Link2 size={15} />
                查看 Agent 状态
                <ArrowUpRight size={15} />
              </Button>
            </motion.div>
          ))}
          <button className="new-bot-card" onClick={onCreate}>
            <span>
              <Plus size={25} />
            </span>
            <strong>下一位好同事</strong>
            <p>为团队带来新的可能</p>
          </button>
        </div>
      ) : (
        <div className="big-empty">
          <div className="empty-bots-art">
            <span>
              <BotIcon size={40} strokeWidth={1.5} />
            </span>
            <i>
              <Sparkles size={20} />
            </i>
          </div>
          <h2>你的团队，拥有无限可能</h2>
          <p>
            把本地执行能力，
            <br />
            变成独立的数字员工。
          </p>
          <Button className="accent-button" onPress={onCreate}>
            <Plus size={17} />
            创建第一位数字员工
          </Button>
          <small>
            <ShieldCheck size={13} />
            独立身份 · 本地能力 · 你的授权
          </small>
        </div>
      )}
    </div>
  );
}
export function ActivityView({ data, onGroup }: { data: Snapshot; onGroup: (id: string) => void }) {
  const [tab, setTab] = useState<'messages' | 'tasks'>('messages');
  const messages = data.messages
    .filter((m) => m.senderType !== 'system')
    .slice()
    .reverse();
  return (
    <div className="page-view">
      <div className="page-eyebrow">EVERY STEP, TOGETHER</div>
      <div className="page-title">
        <div>
          <h1>活动记录</h1>
          <p>每一次交流，每一步进展，都留在这里。</p>
        </div>
        <span className="history-count">
          {messages.length} 条消息 · {data.tasks.length} 项工作
        </span>
      </div>
      <div className="activity-tabs">
        <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>
          <MessageSquare size={16} />
          协作消息<span>{messages.length}</span>
        </button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          <Activity size={16} />
          工作进展<span>{data.tasks.length}</span>
        </button>
      </div>
      {tab === 'messages' ? (
        messages.length ? (
          <div className="activity-list">
            {messages.map((m) => (
              <button key={m.id} onClick={() => onGroup(m.groupId)}>
                <span className="activity-icon">
                  <MessageSquare size={17} />
                </span>
                <div>
                  <strong>
                    {data.bots.find((b) => b.id === m.senderId)?.name ?? '我'}
                    <span>
                      在 {data.groups.find((g) => g.id === m.groupId)?.directBotId ? '与 ' : '#'}
                      {data.groups.find((g) => g.id === m.groupId)?.name}
                      {data.groups.find((g) => g.id === m.groupId)?.directBotId
                        ? ' 的单独聊天'
                        : ''}{' '}
                      中发送了消息
                    </span>
                  </strong>
                  <p>{m.content}</p>
                </div>
                <time>
                  {new Date(m.timestamp).toLocaleDateString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                  })}{' '}
                  {new Date(m.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <EmptySmall
            icon={<MessageSquare size={25} />}
            title="让第一段对话，成为新的起点"
            description="群组中的消息会实时出现在这里。"
          />
        )
      ) : data.tasks.length ? (
        <div className="task-history">
          {data.tasks
            .slice()
            .reverse()
            .map((t) => (
              <TaskCard key={t.id} task={t} bot={data.bots.find((b) => b.id === t.botId)} />
            ))}
        </div>
      ) : (
        <EmptySmall
          icon={<Activity size={25} />}
          title="还没有工作记录"
          description="本地 Bridge 接入并执行任务后，进展会保存在这里。"
        />
      )}
    </div>
  );
}
export function SearchDialog({
  data,
  onClose,
  onGroup,
  onBot,
}: {
  data: Snapshot;
  onClose: () => void;
  onGroup: (id: string, query?: string) => void;
  onBot: (bot: Bot) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const groups = data.groups.filter(
    (g) => !g.directBotId && (!q || `${g.name} ${g.description}`.toLowerCase().includes(q)),
  );
  const bots = data.bots.filter(
    (b) => !q || `${b.name} ${b.description}`.toLowerCase().includes(q),
  );
  const messages = q
    ? data.messages
        .filter((m) => m.senderType !== 'system' && m.content.toLowerCase().includes(q))
        .slice(-12)
        .reverse()
    : [];
  return (
    <Dialog open onClose={onClose} title="搜索消息和 Bot" wide>
      <div className="global-search">
        <Search size={19} />
        <input
          autoFocus
          aria-label="搜索消息和 Bot"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索群组、数字员工和消息…"
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results">
        {groups.length > 0 && (
          <>
            <h4>协作群组</h4>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onGroup(g.id);
                  onClose();
                }}
              >
                <Hash size={17} />
                <div>
                  <strong>{g.name}</strong>
                  <small>{g.description}</small>
                </div>
                <ArrowRight size={15} />
              </button>
            ))}
          </>
        )}
        {bots.length > 0 && (
          <>
            <h4>数字员工</h4>
            {bots.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  onClose();
                  onBot(b);
                }}
              >
                <BotAvatar bot={b} size="small" />
                <div>
                  <strong>{b.name}</strong>
                  <small>本地执行能力</small>
                </div>
                <Status status={b.status} />
              </button>
            ))}
          </>
        )}
        {messages.length > 0 && (
          <>
            <h4>相关消息</h4>
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onGroup(m.groupId, query);
                  onClose();
                }}
              >
                <MessageSquare size={16} />
                <div>
                  <strong>{m.content.slice(0, 90)}</strong>
                  <small>
                    {data.groups.find((g) => g.id === m.groupId)?.directBotId ? '单聊 · ' : '#'}
                    {data.groups.find((g) => g.id === m.groupId)?.name}
                  </small>
                </div>
                <ArrowRight size={15} />
              </button>
            ))}
          </>
        )}
        {!groups.length && !bots.length && !messages.length && (
          <EmptySmall
            icon={<Search size={23} />}
            title="没有找到相关结果"
            description="换个关键词，再试试看。"
          />
        )}
      </div>
      <div className="search-footer">
        <span>搜索消息、Bot 和群组</span>
        <span>{groups.length + bots.length + messages.length} 项结果</span>
      </div>
    </Dialog>
  );
}
