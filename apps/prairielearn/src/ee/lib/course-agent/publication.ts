import { execa } from 'execa';

import type { AuthzData } from '../../../lib/authz-data-lib.js';
import type { Course, CourseAgentPushApproval, User } from '../../../lib/db-types.js';
import { Editor } from '../../../lib/editors.js';
import { getCourseCommitHash } from '../../../models/course.js';

export function validateCourseAgentPublication(
  approval: Pick<CourseAgentPushApproval, 'repository' | 'branch' | 'base_sha' | 'diff'>,
  course: Pick<Course, 'repository' | 'branch'>,
) {
  if (approval.repository !== course.repository || approval.branch !== course.branch) {
    throw new Error('The approved repository or branch no longer matches the course');
  }
  if (!approval.diff.trim()) throw new Error('The approved diff is empty');
}

class CourseAgentDiffEditor extends Editor {
  constructor(params: {
    locals: { authz_data: AuthzData; course: Course; user: User };
    approval: CourseAgentPushApproval;
  }) {
    super({ locals: params.locals, description: 'Publish course-agent changes' });
    this.approval = params.approval;
  }

  private approval: CourseAgentPushApproval;

  async write() {
    const head = (
      await execa('git', ['rev-parse', 'HEAD'], { cwd: this.course.path })
    ).stdout.trim();
    if (head !== this.approval.base_sha) {
      throw new Error(
        `The course branch changed after approval (expected ${this.approval.base_sha}, found ${head})`,
      );
    }
    await execa('git', ['apply', '--check', '--binary', '-'], {
      cwd: this.course.path,
      input: this.approval.diff,
    });
    await execa('git', ['apply', '--index', '--binary', '-'], {
      cwd: this.course.path,
      input: this.approval.diff,
    });
    return {
      pathsToAdd: ['-A'],
      commitMessage: `Apply course-agent changes (${this.approval.id})`,
    };
  }
}

export async function publishCourseAgentApproval({
  approval,
  course,
  user,
  authzData,
}: {
  approval: CourseAgentPushApproval;
  course: Course;
  user: User;
  authzData: AuthzData;
}) {
  validateCourseAgentPublication(approval, course);
  const remote = (
    await execa('git', ['ls-remote', approval.repository, `refs/heads/${approval.branch}`])
  ).stdout
    .trim()
    .split(/\s+/, 1)[0];
  if (remote !== approval.base_sha) {
    throw new Error(
      `The remote branch changed after approval (expected ${approval.base_sha}, found ${remote || 'missing'})`,
    );
  }
  const editor = new CourseAgentDiffEditor({
    locals: { authz_data: authzData, course, user },
    approval,
  });
  const job = await editor.prepareServerJob();
  await editor.executeWithServerJob(job);
  return {
    jobSequenceId: job.jobSequenceId,
    commitSha: await getCourseCommitHash(course.path),
  };
}
