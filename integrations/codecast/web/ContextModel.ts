import type { ClientEvent, FileChange, StoredEvent } from './protocol';
import type { DirectoryStatus } from './workspaceTypes';
import type { TaskStatusCategory } from '../../shared/tasks/statuses';
import { parsePatch } from '../lib/patchParser';

// A presentation projection, not an additional task/session store. Undefined
// facts stay unknown. A captured message does not prove execution or causation.
export type SourceMessage = {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  time: number;
};
export type Activity = {
  id: string;
  title: string;
  member: { id: string; name: string };
  workspace: { id: string; label: string; own: boolean };
  event: ClientEvent;
  receipt?: Pick<StoredEvent, 'seq' | 'receivedAt'>;
  task?: { id: string; title: string; status: TaskStatusCategory };
  request?: { recipientId: string; status: 'pending' | 'accepted'; nextStep: string };
  directoryStatus?: DirectoryStatus;
  session?: { id: string; adapter: 'codex'; messages: SourceMessage[]; historyIndexed: boolean };
  checkpoint?: {
    id: string;
    receivedParts: number;
    totalParts: number;
    localComplete: boolean;
    serverComplete: boolean;
    integrity: 'verified' | 'legacy-unverified' | 'invalid';
    files: FileChange[];
  };
  backup?: { location: 'local-convex-storage'; remote: false; complete: boolean };
  note?: string;
};
const progressLabels: Record<TaskStatusCategory, string> = {
  backlog: '任务待安排',
  open: '任务待开始',
  in_progress: '任务进行中',
  in_review: '任务待审阅',
  done: '任务已完成',
  dropped: '任务已取消',
};
export function presentation(activity: Activity, userId = 'me') {
  return {
    progress: activity.task ? progressLabels[activity.task.status] : '未提供任务进展',
    execution: '捕获日志不提供当前执行状态',
    action:
      activity.request?.status === 'pending' && activity.request.recipientId === userId
        ? activity.request.nextStep
        : null,
    delivery: activity.receipt
      ? '服务已确认'
      : activity.directoryStatus?.pending
        ? `本机待同步 ${activity.directoryStatus.pending} 条`
        : '交付状态未知',
    attribution: activity.session ? 'Codex 日志来源已知；文件因果未证实' : '未关联 Agent 会话',
    completeness: activity.checkpoint
      ? activity.checkpoint.serverComplete && activity.checkpoint.integrity === 'verified'
        ? '共享检查点完整'
        : `共享检查点 ${activity.checkpoint.receivedParts}/${activity.checkpoint.totalParts} 片`
      : '无关联检查点',
    backup: activity.backup?.complete ? '本机 Convex 已存副本；非异机备份' : '无异机备份证据',
  };
}
export function changeCounts(files: FileChange[]) {
  return files.reduce(
    (total, file) => {
      if (file.binary || file.status === 'excluded') return total;
      for (const hunk of parsePatch(file.patch).hunks)
        for (const line of hunk.lines) {
          if (line.type === 'addition') total.added++;
          if (line.type === 'deletion') total.removed++;
        }
      return total;
    },
    { added: 0, removed: 0 },
  );
}
export function canPreview(activity: Activity) {
  return (
    activity.workspace.own &&
    activity.checkpoint?.localComplete === true &&
    activity.checkpoint.integrity === 'verified'
  );
}
