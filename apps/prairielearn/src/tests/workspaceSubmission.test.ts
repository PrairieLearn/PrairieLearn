import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import JSZip from 'jszip';
import * as tmp from 'tmp-promise';
import { afterAll, assert, beforeAll, describe, it, vi } from 'vitest';

import { saveSubmission } from '../lib/grading.js';
import { ensureVariant } from '../lib/question-variant.js';
import * as workspace from '../lib/workspace.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectSubmissionById } from '../models/submission.js';

import * as helperServer from './helperServer.js';
import { getConfiguredUser } from './utils/auth.js';

describe('Workspace submissions', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('preserves file provenance through parsing without adding workspace files to the raw answer', async () => {
    const course = await selectCourseById('1');
    const question = await selectQuestionByQid({ course_id: course.id, qid: 'workspace' });
    const user = await getConfiguredUser();
    const variant = await ensureVariant({
      question_id: question.id,
      instance_question_id: null,
      user_id: user.id,
      authn_user_id: user.id,
      course_instance: null,
      variant_course: course,
      question_course: course,
      options: {},
      require_open: true,
      client_fingerprint_id: null,
    });
    const uploadedFile = {
      name: 'notes.txt',
      contents: Buffer.from('Uploaded notes').toString('base64'),
    };
    const workspaceFiles = ['starter_code.h', 'starter_code.c'].map((name) => ({
      name,
      contents: Buffer.from(`Workspace contents for ${name}`).toString('base64'),
      source: 'workspace',
    }));

    await tmp.withDir(
      async ({ path }) => {
        const zipPath = join(path, 'workspace.zip');
        const zip = new JSZip();
        for (const file of workspaceFiles) {
          zip.file(file.name, file.contents, { base64: true });
        }
        await writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
        const getGradedFiles = vi.spyOn(workspace, 'getGradedFiles').mockResolvedValue(zipPath);
        try {
          const { submission_id } = await saveSubmission(
            {
              variant_id: variant.id,
              user_id: user.id,
              auth_user_id: user.id,
              submitted_answer: { _files: [uploadedFile] },
            },
            variant,
            question,
            course,
          );
          const submission = await selectSubmissionById({ submission_id });
          assert.isFalse(submission.broken);
          assert.deepEqual(submission.submitted_answer?._files, [uploadedFile, ...workspaceFiles]);
          assert.deepEqual(submission.raw_submitted_answer, { _files: [uploadedFile] });
        } finally {
          getGradedFiles.mockRestore();
        }
      },
      { unsafeCleanup: true },
    );
  });
});
