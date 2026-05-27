import { config } from '../../../lib/config.js';
import { type ServerJob } from '../../../lib/server-jobs.js';

/**
 * `git add . && git commit -m <message> && git push [origin <branch>]` inside
 * the cloned eval repo, using the same identity / `GIT_SSH_COMMAND` plumbing
 * as the rest of PL. Caller is responsible for ensuring there is something
 * staged — `git commit` errors when there are no changes.
 */
export async function commitAndPushEvalRepo({
  cwd,
  branch,
  message,
  job,
}: {
  cwd: string;
  branch?: string | null;
  message: string;
  job: ServerJob;
}): Promise<void> {
  const gitEnv = { ...process.env };
  if (config.gitSshCommand != null) {
    gitEnv.GIT_SSH_COMMAND = config.gitSshCommand;
  }
  const gitOptions = { cwd, env: gitEnv };

  await job.exec(
    'git',
    [
      '-c',
      'user.email=ai-grading-eval@prairielearn.local',
      '-c',
      'user.name=AI Grading Eval',
      'add',
      '.',
    ],
    gitOptions,
  );
  await job.exec(
    'git',
    [
      '-c',
      'user.email=ai-grading-eval@prairielearn.local',
      '-c',
      'user.name=AI Grading Eval',
      'commit',
      '-m',
      message,
    ],
    gitOptions,
  );

  const pushArgs = ['push'];
  if (branch) pushArgs.push('origin', branch);
  await job.exec('git', pushArgs, gitOptions);
}
