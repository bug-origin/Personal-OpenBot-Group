import type { Task } from './index.js';

/** Internal references are useful for coordination, not for the group conversation. */
export function conversationalText(content: string, tasks: Task[]) {
  let text = content;
  for (const task of tasks) {
    const ids = [task.id, task.id.slice(0, 8)];
    for (const id of ids) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`任务(?:编号)?[\\s:：#]*${escaped}`, 'g'), '这件事');
      text = text.replaceAll(id, '这件事');
    }
    for (const id of [task.execution?.contextMessageId, task.correlationId])
      if (id) text = text.replaceAll(id, '');
  }
  return text.trim();
}

export function workActivity(activity: string | null | undefined) {
  if (!activity) return '';
  if (/等待所有者批准|等待.*审批/.test(activity)) return '需要你确认一下操作，我才能继续。';
  if (/连接中断|结果未知/.test(activity)) return '本地连接断了，现在还无法确认处理结果。';
  if (/续接|新要求/.test(activity)) return '正在按你补充的要求继续处理。';
  if (/当前任务要求/.test(activity)) return '正在处理你交代的事情。';
  if (/启动本地执行会话/.test(activity)) return '我在准备，马上看。';
  if (/命令已结束/.test(activity))
    return /退出码 [1-9]/.test(activity)
      ? '刚才的一步操作没有成功，正在检查原因。'
      : '刚做完一步操作，正在确认结果。';
  if (/运行本地命令/.test(activity)) return '正在执行你交代的操作，还没结束。';
  if (/文件变更|文件操作/.test(activity)) return '正在处理相关文件。';
  if (/执行者正在处理任务/.test(activity)) return '我还在处理。';
  if (/执行已完成/.test(activity)) return '处理好了。';
  if (/执行已停止/.test(activity)) return '已经停下来了。';
  if (/执行失败/.test(activity)) return '遇到了一点问题，还没完成。';
  return activity;
}

export function workProgress(task: Task) {
  const e = task.execution;
  let text: string;
  if (e?.pendingChange?.status === 'interrupted')
    text = '刚才中断了，还没能按你补充的要求继续，需要先确认一下情况。';
  else if (e?.pendingChange) text = '收到你的调整了，正在停下手头的操作，确认后再按新要求继续。';
  else if (task.status === 'queued') text = '这件事还没开始，我会接着处理。';
  else if (task.status === 'cancelling') text = '正在停下手头的操作，停稳后告诉你。';
  else if (task.status === 'cancelled') text = '已经停下来了。';
  else if (task.status === 'reviewing') text = '执行结果已返回，我正在检查是否满足要求。';
  else if (task.status === 'failed')
    text = `这边遇到了问题，还没完成。${task.error ? `\n${task.error}` : ''}`;
  else if (task.status === 'completed')
    text = task.result?.trim() ? task.result : '已经处理完了，没有更多结果需要补充。';
  else {
    const report = e?.report?.trim();
    const activity = workActivity(e?.activity);
    text =
      [report, activity && !report?.includes(activity) ? activity : '']
        .filter(Boolean)
        .join('\n') || '我还在处理，暂时没有新的进展。';
  }
  return conversationalText(text, [task]);
}
