import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';

import type * as courseDb from '../../../sync/course-db.js';

import { validateCourseAgentProposal } from './publication.js';

// Use the actual course loader without requiring a database course for this temporary checkout.
vi.mock('../../../sync/course-db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof courseDb>();
  return {
    ...actual,
    loadFullCourse: (_id: string, checkout: string) => actual.loadFullCourse(null, checkout),
  };
});

const testCourse = path.resolve(import.meta.dirname, '../../../../../../testCourse');

async function withProposal(
  edit: (checkout: string) => Promise<void>,
  check: (params: Parameters<typeof validateCourseAgentProposal>) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pl-proposal-test-'));
  const checkout = path.join(directory, 'course');
  const git = async (...args: string[]) =>
    (
      await execa('git', args, {
        cwd: checkout,
        env: {
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
      })
    ).stdout;
  try {
    await mkdir(path.join(checkout, 'questions'), { recursive: true });
    await cp(path.join(testCourse, 'infoCourse.json'), path.join(checkout, 'infoCourse.json'));
    await cp(
      path.join(testCourse, 'questions/addNumbers'),
      path.join(checkout, 'questions/addNumbers'),
      { recursive: true },
    );
    await git('init', '-b', 'master');
    await git('add', '.');
    await git('commit', '-m', 'Initial fixture');
    const baseSha = await git('rev-parse', 'HEAD');
    await edit(checkout);
    await git('add', '-A');
    await git('commit', '-m', 'Proposed change');
    const proposedSha = await git('rev-parse', 'HEAD');
    const treeSha = await git('rev-parse', 'HEAD^{tree}');
    const diff = await git('diff', '--binary', baseSha, proposedSha);
    // The live course remains at the old revision while validation applies the proposal elsewhere.
    await git('checkout', '--detach', baseSha);
    await git('branch', '-f', 'master', baseSha);
    await check([
      { id: '1', path: checkout, branch: 'master', repository: checkout },
      {
        branch: 'master',
        baseSha,
        proposedSha,
        treeSha,
        diff: diff + '\n',
        diffSummary: '',
        commitMessage: 'Proposed change',
      },
    ]);
    expect(await git('rev-parse', 'HEAD')).toBe(baseSha);
    expect(await git('status', '--porcelain')).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('automatic pre-approval validation', () => {
  it('reuses AI HTML validation before showing approval', async () => {
    await withProposal(
      (checkout) =>
        writeFile(
          path.join(checkout, 'questions/addNumbers/question.html'),
          '<!doctype html><html><body>Invalid question document</body></html>',
        ),
      async (params) => {
        await expect(validateCourseAgentProposal(...params)).rejects.toThrow('DOCTYPE');
      },
    );
  });
  it('rejects a proposal whose remote base changed before showing approval', async () => {
    await withProposal(
      (checkout) => writeFile(path.join(checkout, 'README.md'), 'Proposed documentation\n'),
      async (params) => {
        await execa('git', ['branch', '-f', 'master', params[1].proposedSha], {
          cwd: params[0].path,
        });
        await expect(validateCourseAgentProposal(...params)).rejects.toThrow(
          'remote branch changed',
        );
      },
    );
  });
  it('validates the exact proposed tree without changing the live course', async () => {
    await withProposal(
      (checkout) => writeFile(path.join(checkout, 'README.md'), 'Proposed documentation\n'),
      async (params) => {
        await expect(validateCourseAgentProposal(...params)).resolves.toBeUndefined();
        await expect(
          validateCourseAgentProposal(params[0], { ...params[1], treeSha: 'a'.repeat(40) }),
        ).rejects.toThrow('Git tree');
      },
    );
  });

  it('returns the real loader error for missing question metadata', async () => {
    await withProposal(
      async (checkout) => {
        const file = path.join(checkout, 'questions/addNumbers/info.json');
        const info = JSON.parse(await readFile(file, 'utf8'));
        delete info.type;
        await writeFile(file, JSON.stringify(info));
      },
      async (params) => {
        await expect(validateCourseAgentProposal(...params)).rejects.toThrow('type');
        await expect(validateCourseAgentProposal(...params)).rejects.toThrow(
          'questions/addNumbers/info.json',
        );
      },
    );
  });

  it('does not let the loader follow a proposed symlink outside the course', async () => {
    await withProposal(
      (checkout) => symlink('/etc/passwd', path.join(checkout, 'outside')),
      async (params) => {
        await expect(validateCourseAgentProposal(...params)).rejects.toThrow('symbolic links');
      },
    );
  });

  it.each([true, false])(
    'rejects an assessment with invalid references (instance metadata: %s)',
    async (includeInstance) => {
      await withProposal(
        async (checkout) => {
          const instance = path.join(checkout, 'courseInstances/Sp15');
          const assessment = path.join(instance, 'assessments/new');
          await mkdir(assessment, { recursive: true });
          if (includeInstance) {
            await cp(
              path.join(testCourse, 'courseInstances/Sp15/infoCourseInstance.json'),
              path.join(instance, 'infoCourseInstance.json'),
            );
          }
          await writeFile(
            path.join(assessment, 'infoAssessment.json'),
            JSON.stringify({
              uuid: 'ca7512cb-6443-438a-859d-e08863518f8d',
              type: 'Homework',
              title: 'Reference check',
              set: 'Homework',
              number: '1',
              zones: [{ questions: [{ id: 'missing-question', autoPoints: 1 }] }],
            }),
          );
        },
        async (params) => {
          await expect(validateCourseAgentProposal(...params)).rejects.toThrow(
            includeInstance ? 'missing-question' : 'infoCourseInstance.json',
          );
        },
      );
    },
  );
});
