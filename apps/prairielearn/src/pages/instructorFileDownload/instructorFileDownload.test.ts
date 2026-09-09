import fs from 'node:fs/promises';
import os from 'node:os';
import * as path from 'node:path';

import express, { type ErrorRequestHandler } from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { withServer } from '@prairielearn/express-test-utils';

import router from './instructorFileDownload.js';

const contexts = [
  { navPage: 'course_admin', directory: '' },
  { navPage: 'instance_admin', directory: 'courseInstances/Fa18' },
  { navPage: 'assessment', directory: 'courseInstances/Fa18/assessments/HW1' },
  { navPage: 'question', directory: 'questions/test/question' },
] as const;

const contents = 'options(repos = c(CRAN = "https://cran.rstudio.com"))\n';
let temporaryPath: string;
let coursePath: string;

function createApp(navPage: string, hasViewPermission = true) {
  const app = express();
  app.use((_req, res, next) => {
    res.locals.course = { id: '1', path: coursePath };
    res.locals.course_instance = { id: '1', short_name: 'Fa18' };
    res.locals.assessment = { id: '1', tid: 'HW1' };
    res.locals.question = { id: '1', qid: 'test/question' };
    res.locals.navPage = navPage;
    res.locals.urlPrefix = '/pl/course/1';
    res.locals.authz_data = {
      has_course_permission_view: hasViewPermission,
      has_course_permission_edit: false,
    };
    next();
  });
  app.use('/file_download', router);
  app.use(((err, _req, res, _next) => {
    const httpError = err as Error & { status?: number };
    res.status(httpError.status ?? 500).send('<h1>Error processing request</h1>');
  }) satisfies ErrorRequestHandler);
  return app;
}

function downloadUrl(url: string, filename: string) {
  // Encode slashes as well so fetch does not normalize traversal attempts before sending them.
  return `${url}/file_download/${encodeURIComponent(filename)}`;
}

async function assertErrorResponse(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.isNull(response.headers.get('Content-Disposition'));
  assert.isNull(response.headers.get('Content-Range'));
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<h1>Error processing request</h1>');
}

describe('Instructor file downloads', () => {
  beforeAll(async () => {
    temporaryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'instructor-file-download-'));
    coursePath = path.join(temporaryPath, 'course');
    for (const { directory } of contexts) {
      const root = path.join(coursePath, directory);
      await fs.mkdir(path.join(root, '.config'), { recursive: true });
      await fs.mkdir(path.join(root, '.git'), { recursive: true });
      await fs.writeFile(path.join(root, '.Rprofile'), contents);
      await fs.writeFile(path.join(root, 'submission.R'), contents);
      await fs.writeFile(path.join(root, '.config', 'profile.R'), contents);
      await fs.writeFile(path.join(root, '.git', 'config'), 'repository internals');
    }
    await fs.writeFile(path.join(temporaryPath, 'outside.R'), 'outside course');
    await fs.mkdir(path.join(coursePath, 'questions/test/question-sibling'), { recursive: true });
    await fs.writeFile(
      path.join(coursePath, 'questions/test/question-sibling/.Rprofile'),
      contents,
    );
    await fs.symlink('.Rprofile', path.join(coursePath, '.profile-link'));
    await fs.symlink('.git', path.join(coursePath, '.repository-link'));
    await fs.symlink('../outside.R', path.join(coursePath, '.outside-link'));
    await fs.symlink(
      '../../../.Rprofile',
      path.join(coursePath, 'questions/test/question/.course-link'),
    );
    await fs.symlink('questions', path.join(coursePath, '.questions-link'));
  });

  afterAll(async () => {
    await fs.rm(temporaryPath, { recursive: true, force: true });
  });

  describe.each(contexts)('$navPage', ({ navPage, directory }) => {
    it.each(['.Rprofile', 'submission.R', '.config/profile.R'])(
      'downloads the actual contents of %s for a course viewer',
      async (filename) => {
        await withServer(createApp(navPage), async ({ url }) => {
          const response = await fetch(
            `${downloadUrl(url, path.join(directory, filename))}?attachment=${encodeURIComponent(path.basename(filename))}`,
          );
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get('Content-Disposition'),
            `attachment; filename="${path.basename(filename)}"`,
          );
          assert.equal(await response.text(), contents);
        });
      },
    );

    it.each(['.Rprofile', 'submission.R'])(
      'requires course view permission for %s',
      async (filename) => {
        await withServer(createApp(navPage, false), async ({ url }) => {
          await assertErrorResponse(
            await fetch(
              `${downloadUrl(url, path.join(directory, filename))}?attachment=profile.R&type=application/pdf`,
            ),
            403,
          );
        });
      },
    );

    it('rejects repository internals', async () => {
      await withServer(createApp(navPage), async ({ url }) => {
        const response = await fetch(downloadUrl(url, path.join(directory, '.git/config')));
        await assertErrorResponse(response, navPage === 'course_admin' ? 500 : 404);
      });
    });
  });

  it('supports inline previews and successful partial downloads', async () => {
    await withServer(createApp('question'), async ({ url }) => {
      const fileUrl = downloadUrl(url, 'questions/test/question/.Rprofile');
      const preview = await fetch(`${fileUrl}?type=text/plain`);
      assert.equal(preview.status, 200);
      assert.isNull(preview.headers.get('Content-Disposition'));
      assert.equal(preview.headers.get('Content-Type'), 'text/plain; charset=utf-8');
      assert.equal(await preview.text(), contents);

      const partial = await fetch(`${fileUrl}?attachment=.Rprofile`, {
        headers: { Range: 'bytes=0-6' },
      });
      assert.equal(partial.status, 206);
      assert.equal(
        partial.headers.get('Content-Range'),
        `bytes 0-6/${Buffer.byteLength(contents)}`,
      );
      assert.equal(await partial.text(), contents.slice(0, 7));
    });
  });

  it.each(['missing.R', '.missing', '.config', 'submission.R/child'])(
    'renders a normal error response for %s',
    async (filename) => {
      await withServer(createApp('question'), async ({ url }) => {
        await assertErrorResponse(
          await fetch(
            `${downloadUrl(url, `questions/test/question/${filename}`)}?attachment=error.pdf&type=application/pdf`,
          ),
          404,
        );
      });
    },
  );

  it('clears download headers when sendFile rejects an unsatisfiable range', async () => {
    await withServer(createApp('question'), async ({ url }) => {
      await assertErrorResponse(
        await fetch(
          `${downloadUrl(url, 'questions/test/question/.Rprofile')}?attachment=error.pdf&type=application/pdf`,
          {
            headers: { Range: 'bytes=10000-' },
          },
        ),
        416,
      );
    });
  });

  it.each([
    { navPage: 'course_admin', filename: '../outside.R' },
    { navPage: 'course_admin', filename: 'questions/test/question/.Rprofile' },
    { navPage: 'course_admin', filename: 'courseInstances/Fa18/.Rprofile' },
    { navPage: 'instance_admin', filename: 'courseInstances/Fa18/assessments/HW1/.Rprofile' },
    { navPage: 'instance_admin', filename: '.Rprofile' },
    { navPage: 'assessment', filename: 'courseInstances/Fa18/.Rprofile' },
    { navPage: 'question', filename: 'questions/test/question-sibling/.Rprofile' },
    { navPage: 'question', filename: 'questions/test/question/../../../.Rprofile' },
    { navPage: 'question', filename: 'questions/test/question/../../../../outside.R' },
  ])('rejects $filename in $navPage', async ({ navPage, filename }) => {
    await withServer(createApp(navPage), async ({ url }) => {
      await assertErrorResponse(
        await fetch(`${downloadUrl(url, filename)}?attachment=.Rprofile`),
        500,
      );
    });
  });

  it('allows symlinks within the same file browser context', async () => {
    await withServer(createApp('course_admin'), async ({ url }) => {
      const response = await fetch(downloadUrl(url, '.profile-link'));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), contents);
    });
  });

  it.each([
    { navPage: 'course_admin', filename: '.repository-link/config' },
    { navPage: 'course_admin', filename: '.outside-link' },
    { navPage: 'course_admin', filename: '.questions-link/test/question/.Rprofile' },
    { navPage: 'question', filename: 'questions/test/question/.course-link' },
  ])('rejects symlink $filename in $navPage', async ({ navPage, filename }) => {
    await withServer(createApp(navPage), async ({ url }) => {
      await assertErrorResponse(await fetch(downloadUrl(url, filename)), 500);
    });
  });
});
