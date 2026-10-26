import { z } from 'zod';
import { idSchema } from './protocol';
export const titleSchema = z.string().trim().min(1).max(160);
export const taskInput = z
  .object({
    title: titleSchema,
    description: z.string().max(8000).default(''),
    assignee: idSchema.nullable().default(null),
  })
  .strict();
export const taskUpdate = taskInput.extend({
  status: z.enum(['todo', 'doing', 'done']),
  version: z.number().int().positive(),
});
export const commentInput = z
  .object({ text: z.string().trim().min(1).max(8000), taskId: idSchema.nullable().default(null) })
  .strict();
export const handoffInput = z
  .object({
    toUser: idSchema,
    title: titleSchema,
    context: z.string().trim().min(1).max(12000),
    nextSteps: z.string().max(8000),
    eventId: idSchema.nullable().default(null),
    taskId: idSchema.nullable().default(null),
  })
  .strict();
export type Task = {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  status: 'todo' | 'doing' | 'done';
  version: number;
  created_by: string;
  updated_at: number;
};
export type Comment = {
  id: string;
  text: string;
  task_id: string | null;
  user_id: string;
  name: string;
  created_at: number;
};
export type Handoff = {
  id: string;
  from_user: string;
  to_user: string;
  title: string;
  context: string;
  next_steps: string;
  event_id: string | null;
  task_id: string | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at: number;
};
export type CollaborationState = {
  tasks: Task[];
  comments: Comment[];
  handoffs: Handoff[];
  next?: Partial<Record<'tasks' | 'comments' | 'handoffs', number | null>>;
};
