import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import { z } from 'zod';

import {
  CourseAgentSnapshotSchema,
  CourseAgentStartRunRequestSchema,
} from '@prairielearn/course-agent-protocol';

const StateSchema = z.object({
  userId: z.string(),
  courseId: z.string(),
  request: CourseAgentStartRunRequestSchema,
  snapshot: CourseAgentSnapshotSchema,
  // HarnessAgent validates its opaque versioned state when resuming it.
  resume: z.custom<HarnessAgentResumeSessionState>().nullable(),
  pendingToolId: z.string().nullable(),
  continuationDelivered: z.string().nullable(),
});
export type State = z.infer<typeof StateSchema>;

export class StateStore {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  private filename(id: string) {
    return path.join(this.directory, `${z.uuid().parse(id)}.json`);
  }

  async load(id: string): Promise<State | null> {
    try {
      return StateSchema.parse(JSON.parse(await readFile(this.filename(id), 'utf8')));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(state: State) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const filename = this.filename(state.request.conversationId);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, filename);
  }

  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const names = await readdir(this.directory);
    const states: State[] = [];
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      const state = await this.load(name.slice(0, -5));
      if (state) states.push(state);
    }
    return states;
  }
}
