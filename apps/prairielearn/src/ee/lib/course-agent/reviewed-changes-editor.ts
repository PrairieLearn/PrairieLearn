import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';

import type { ReviewSnapshot } from '@prairielearn/course-agent-types';

import type { Course, User } from '../../../lib/db-types.js';
import { FileDeleteEditor, FileUploadEditor, MultiEditor } from '../../../lib/editors.js';

import { readReviewBaseFiles } from './review-diff.js';

export class ReviewedChangesEditor extends MultiEditor {
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
    const locals = { course, user, authz_data: authzData };
    const container = { rootPath: course.path, invalidRootPaths: [path.join(course.path, '.git')] };
    super({ locals, description: 'Apply reviewed course agent edits' }, [
      new FileUploadEditor({
        locals,
        container,
        files: Object.fromEntries(
          snapshot.additions.map((file) => [
            path.join(course.path, file.path),
            Buffer.from(file.contents, 'base64'),
          ]),
        ),
      }),
      ...snapshot.deletions.map(
        (file) =>
          new FileDeleteEditor({
            locals,
            container,
            deletePath: path.join(course.path, file.path),
          }),
      ),
    ]);
    this.snapshot = snapshot;
  }

  override async write() {
    const baseFiles = await readReviewBaseFiles(this.course, this.snapshot);
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
    if (this.snapshot.type === 'local') {
      const conflicts: string[] = [];
      for (const file of paths) {
        const current = await fs
          .readFile(path.join(this.course.path, file))
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
        const original = baseFiles.get(file) ?? null;
        if (current === null ? original !== null : original === null || !current.equals(original)) {
          conflicts.push(file);
        }
      }
      if (conflicts.length > 0) {
        throw new Error(
          `Local course files changed: ${conflicts.join(', ')}. No changes were saved. Reconcile the edits or start a new conversation.`,
        );
      }
    }
    const result = await super.write();
    return (
      result && {
        ...result,
        pathsToAdd: result.pathsToAdd.map(
          (file) => `:(literal)${path.relative(this.course.path, file)}`,
        ),
      }
    );
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
