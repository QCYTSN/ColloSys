import Link from 'next/link';
import { ArrowsLeftRight, Chats } from '@phosphor-icons/react';
export function TaskContextLinks({
  projectId,
  taskId,
}: {
  projectId?: string | null;
  taskId: string;
}) {
  if (!projectId) return null;
  return (
    <div className="collo-task-context">
      <Link href={`/projects/${projectId}?tab=sessions`}>
        <Chats size={17} />
        Project conversations
      </Link>
      <Link href={`/projects/${projectId}?tab=handoffs&fromTask=${taskId}`}>
        <ArrowsLeftRight size={17} />
        Prepare handoff
      </Link>
    </div>
  );
}
