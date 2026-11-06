import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeskhandTask } from '@deskhand/shared-protocol';
export const STATE_DIR = process.env.DESKHAND_STATE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.deskhand');
export class TaskRepository {
  private directory: string;
  constructor(directory = path.join(STATE_DIR, 'tasks')) { this.directory = directory; fs.mkdirSync(directory, { recursive: true }); }
  save(task: DeskhandTask): void {
    if (!/^task-[a-zA-Z0-9-]+$/.test(task.taskId)) return;
    const file = path.join(this.directory, task.taskId + '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(task, null, 2), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  get(id: string): DeskhandTask | undefined {
    if (!/^task-[a-zA-Z0-9-]+$/.test(id)) return;
    try { return JSON.parse(fs.readFileSync(path.join(this.directory, id + '.json'), 'utf8')); } catch { return; }
  }
  recent(): DeskhandTask[] {
    return fs.readdirSync(this.directory).filter(file => file.endsWith('.json')).flatMap(file => {
      try { return [JSON.parse(fs.readFileSync(path.join(this.directory, file), 'utf8')) as DeskhandTask]; } catch { return []; }
    }).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  }
  resolveParent(roomId: string, threadId?: string): DeskhandTask | undefined {
    return this.recent().find(task => task.roomId === roomId && task.threadId === threadId && task.bugReport && !task.parentTaskId);
  }
}
