import { useState } from 'react';
import { Button } from '@heroui/react';
import {
  ArrowRight,
  Check,
  Bot as BotIcon,
  ChevronRight,
  Info,
  Network,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { Bot, Group, Provider, Snapshot } from '@openbot/shared';
import { BotAvatar, Dialog, Field } from './Primitives';
type Mutate = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
export function GroupDialog({
  group,
  bots,
  onClose,
  onSave,
  onDeleted,
  mutate,
}: {
  group?: Group;
  bots: Bot[];
  onClose: () => void;
  onSave: (id: string) => void;
  onDeleted: (id: string) => void;
  mutate: Mutate;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [selected, setSelected] = useState<string[]>(group?.botIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function remove() {
    if (!group || busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`/api/groups/${group.id}`, undefined, 'DELETE');
      onDeleted(group.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await mutate<{ id: string }>(
        group ? `/api/groups/${group.id}` : '/api/groups',
        { name, description, botIds: selected },
        group ? 'PATCH' : 'POST',
      );
      onSave(result.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={confirmDelete ? '删除群组' : group ? '群组设置' : '创建协作群组'}
      subtitle={confirmDelete ? `确定删除「${group?.name}」？` : '为一个目标，聚集对的人与 Agent。'}
    >
      {confirmDelete ? (
        <div className="dialog-form">
          <p className="group-delete-description">
            该群组的聊天记录、任务记录和群内记忆将永久删除。数字员工及各自的长期记忆会保留。
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="tertiary"
              isDisabled={busy}
              onPress={() => {
                setConfirmDelete(false);
                setError('');
              }}
            >
              返回
            </Button>
            <Button variant="danger" isPending={busy} onPress={() => void remove()}>
              确认删除
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="dialog-form">
          <Field
            label="群组名称"
            value={name}
            onChange={setName}
            placeholder="例如：产品实验室"
            required
          />
          <Field
            label="群组描述"
            value={description}
            onChange={setDescription}
            placeholder="你们想一起完成什么？"
            multiline
          />
          <div className="form-section-label">
            邀请数字员工 <span>可稍后添加</span>
          </div>
          {bots.length ? (
            <div className="bot-pick-list">
              {bots.map((bot) => (
                <button
                  type="button"
                  key={bot.id}
                  className={`bot-pick ${selected.includes(bot.id) ? 'selected' : ''}`}
                  onClick={() =>
                    setSelected((s) =>
                      s.includes(bot.id) ? s.filter((id) => id !== bot.id) : [...s, bot.id],
                    )
                  }
                >
                  <BotAvatar bot={bot} />
                  <div>
                    <strong>{bot.name}</strong>
                    <small>本地执行能力</small>
                  </div>
                  <span className="check-box">
                    {selected.includes(bot.id) && <Check size={13} />}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="inline-note">
              <BotIcon size={18} />
              <span>还没有数字员工。创建群组后，可随时添加 Bot。</span>
            </div>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            {group && !group.directBotId && (
              <Button
                type="button"
                variant="danger-soft"
                className="group-delete-button"
                isDisabled={busy}
                onPress={() => {
                  setConfirmDelete(true);
                  setError('');
                }}
              >
                <Trash2 size={15} />
                删除群组
              </Button>
            )}
            <Button variant="tertiary" onPress={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              isPending={busy}
              isDisabled={!name.trim()}
              className="accent-button"
            >
              {group ? '保存更改' : '创建群组'}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
export function BotDialog({
  onClose,
  onSave,
  mutate,
  data,
}: {
  onClose: () => void;
  onSave: () => void;
  mutate: Mutate;
  data: Snapshot | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const provider: Provider = 'codex';
  const [selected, setSelected] = useState('');
  const available = (data?.bridges ?? []).filter((bridge) =>
    bridge.providers.some((p) => p.available),
  );
  const selectedBridge =
    available.find((bridge) => bridge.id === selected)?.id ??
    (available.length === 1 ? available[0].id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mutate('/api/bots', {
        name,
        description,
        provider,
        ...(selectedBridge ? { bridgeId: selectedBridge } : {}),
      });
      onSave();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="认识你的新同事"
      subtitle="创建持久的 Bot 身份，保留独立的能力与工作方式。"
    >
      <form onSubmit={submit} className="dialog-form">
        <Field
          label="Bot 名称"
          value={name}
          onChange={setName}
          placeholder="例如：Alice"
          required
        />
        <Field
          label="职责描述"
          value={description}
          onChange={setDescription}
          placeholder="例如：负责架构设计与代码审查"
          multiline
        />
        <div className="inline-note">
          <Sparkles size={18} />
          <span>
            {data?.model?.configured
              ? `${data.model.name} 负责对话、记忆和工作安排`
              : '在设置中选择对话模型，负责对话、记忆和工作安排'}
            。Bot 会使用已连接的本地能力完成任务。
          </span>
        </div>
        {available.length > 1 && (
          <label className="form-section-label">
            运行设备
            <select
              aria-label="运行设备"
              value={selectedBridge}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="" disabled>
                选择运行设备
              </option>
              {available.map((bridge) => (
                <option key={bridge.id} value={bridge.id}>
                  {bridge.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="inline-note">
          <ShieldCheck size={18} />
          <span>
            {available.length
              ? '本地执行能力已就绪，创建后自动连接，可直接加入群组开始协作。'
              : '本地执行能力暂不可用。可以先创建，连接就绪后即可开始协作。'}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="tertiary" onPress={onClose}>
            取消
          </Button>
          <Button
            type="submit"
            isPending={busy}
            isDisabled={!name.trim() || (available.length > 1 && !selectedBridge)}
            className="accent-button"
          >
            创建数字员工
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function BridgeDialog({
  onClose,
  bot,
  data,
  mutate,
}: {
  onClose: () => void;
  bot?: Bot;
  data: Snapshot | null;
  mutate: Mutate;
}) {
  const bridges = data?.bridges ?? [];
  const [selected, setSelected] = useState(bot?.bridgeId ?? bridges[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function bind(e: React.FormEvent) {
    e.preventDefault();
    if (!bot) return;
    setBusy(true);
    setError('');
    try {
      await mutate(`/api/bots/${bot.id}/bind`, {
        bridgeId: selectedBridge,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const capable = bridges.filter((b) => b.providers.some((p) => p.available));
  const selectedBridge = capable.find((b) => b.id === selected)?.id ?? capable[0]?.id ?? '';
  const canSwitch = Boolean(
    bot &&
    capable.length &&
    (capable.length > 1 || (bot.bridgeId && bot.bridgeId !== selectedBridge)),
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={bot ? `${bot.name} 的 Agent 状态` : '本地 Agent 状态'}
      subtitle="你的 Agent、工具与授权，始终由你掌控。"
    >
      <div className="bridge-visual">
        <span>
          <Terminal size={25} />
        </span>
        <i />
        <span className="bridge-logo">
          <BotIcon size={27} />
        </span>
        <i />
        <span>
          <Network size={25} />
        </span>
      </div>
      <div className="inline-note">
        <ShieldCheck size={18} />
        <span>
          {!bot
            ? '本地能力使用本机配置。创建 Bot 时自动连接，需要额外权限时会在群里申请。'
            : 'Bot 可使用已连接的本地能力读取和搜索文件；修改文件或运行命令时，会按本机权限设置请求授权。每项工作保留独立会话，可以接着聊。'}
        </span>
      </div>
      <div className="bridge-list">
        {bridges.length ? (
          bridges.map((bridge) => (
            <div className="binding-details" key={bridge.id}>
              <div>
                <span>设备</span>
                <strong>{bridge.name}</strong>
              </div>
              <div>
                <span>执行能力</span>
                <strong>{bridge.providers.some((p) => p.available) ? '已连接' : '暂不可用'}</strong>
                <small>
                  {bridge.providers.some((p) => p.available)
                    ? '可读取文件并按授权执行任务'
                    : '请检查本地连接'}
                </small>
              </div>
            </div>
          ))
        ) : (
          <div className="help-block">
            <Terminal size={18} />
            <div>
              <strong>本地 Bridge 未连接</strong>
              <p>
                通过 <code>npm run desktop</code> 或 <code>npm run dev</code>{' '}
                应用会自动启动并连接本机 Agent。暂未就绪时，请检查对应 Agent 是否已安装并配置。
              </p>
            </div>
          </div>
        )}
      </div>
      {canSwitch && bot && (
        <form onSubmit={bind} className="dialog-form">
          <label className="form-section-label">
            运行设备
            <select
              aria-label="运行设备"
              value={selectedBridge}
              onChange={(e) => setSelected(e.target.value)}
            >
              {capable.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-note">
            <Info size={16} />
            <span>
              普通群消息的近期上下文会发送给已配置的路由服务，以选择合适的 Bot。Agent
              凭据始终保留在本地。
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="tertiary" onPress={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              className="accent-button"
              isDisabled={!capable.length}
              isPending={busy}
              onPress={() => {
                if (!selected && capable[0]) setSelected(capable[0].id);
              }}
            >
              切换运行设备
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
      {!canSwitch && (
        <div className="dialog-actions">
          <Button className="accent-button" onPress={onClose}>
            了解了
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </Dialog>
  );
}
