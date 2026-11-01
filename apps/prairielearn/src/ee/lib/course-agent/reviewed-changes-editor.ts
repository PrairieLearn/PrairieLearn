import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';

import type { ReviewSnapshot } from '@prairielearn/course-agent-types';

import type { Course, User } from '../../../lib/db-types.js';
import { Editor } from '../../../lib/editors.js';

import { readReviewBaseFiles } from './review-diff.js';

export class ReviewedChangesEditor extends Editor {
  private snapshot: ReviewSnapshot;

  constructor({
    course,
    user,
    authzData,
    snapshot,
  }: {
    course: Course;
    user: Pick<User, 'id' | 'name' | 'email' | 'uid'>;
    authzData: { has_course_permission_edit: boolean; authn_user: Pick<User, 'id'> };
    snapshot: ReviewSnapshot;
  }) {
    super({
      locals: { course, user, authz_data: authzData },
      description: 'Apply reviewed course agent edits',
    });
    this.snapshot = snapshot;
  }

  async write() {
    await readReviewBaseFiles(this.course, this.snapshot);
    const paths = [...this.snapshot.additions, ...this.snapshot.deletions].map((file) => file.path);
    // A path inside the course can still escape through a tracked symlink.
    // Validate ancestors before writing or removing anything in the checkout.
    for (const file of paths) {
      const parts = file.split('/');
      for (let depth = 1; depth <= parts.length; depth++) {
        const target = path.join(this.course.path, ...parts.slice(0, depth));
        const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (!stat) break;
        if (depth < parts.length ? !stat.isDirectory() : !stat.isFile()) {
          throw new Error(`Only regular course files can be edited: ${file}`);
        }
      }
    }
    for (const file of this.snapshot.deletions) {
      await fs.remove(path.join(this.course.path, file.path));
    }
    for (const file of this.snapshot.additions) {
      const target = path.join(this.course.path, file.path);
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, Buffer.from(file.contents, 'base64'));
    }
    return paths.length === 0
      ? null
      : {
          pathsToAdd: paths.map((file) => `:(literal)${file}`),
          commitMessage: this.description,
        };
  }

  protected override async validateStagedChanges() {
    for (const file of this.snapshot.additions) {
      const { stdout } = await execa('git', ['show', `:${file.path}`], {
        cwd: this.course.path,
        encoding: 'buffer',
        stripFinalNewline: false,
      });
      if (!Buffer.from(stdout).equals(Buffer.from(file.contents, 'base64'))) {
        throw new Error(`Git attributes or filters changed the reviewed contents of ${file.path}.`);
      }
    }
  }
}
