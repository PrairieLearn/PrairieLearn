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
];
const contents = 'options(repos = c(CRAN = "https://cran.rstudio.com"))\n';
let temporaryPath: string;
let coursePath: string;

function createApp(navPage = 'course_admin', hasViewPermission = true) {
  const app = express();
  app.use((_req, res, next) => {
    res.locals.course = { id: '1', path: coursePath };
    res.locals.course_instance = { id: '1', short_name: 'Fa18' };
    res.locals.assessment = { id: '1', tid: 'HW1' };
    res.locals.question = { id: '1', qid: 'test/question' };
    res.locals.navPage = navPage;
    res.locals.urlPrefix = '/pl/course/1';
    res.locals.authz_data = { has_course_permission_view: hasViewPermission };
    next();
  });
  app.use('/file_download', router);
  app.use(((err, _req, res, _next) => {
    res.status((err as Error & { status?: number }).status ?? 500).send('<h1>Error</h1>');
  }) satisfies ErrorRequestHandler);
  return app;
}

function downloadUrl(url: string, filename: string) {
  // Encode slashes so fetch does not normalize traversal attempts before sending them.
  return `${url}/file_download/${encodeURIComponent(filename)}`;
}

async function assertErrorResponse(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.isNull(response.headers.get('Content-Disposition'));
  assert.isNull(response.headers.get('Content-Range'));
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<h1>Error</h1>');
}

describe('Instructor file downloads', () => {
  beforeAll(async () => {
    temporaryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'instructor-file-download-'));
    coursePath = path.join(temporaryPath, 'course');
    // Exercise both a symlink above the question root and a symlinked excluded directory.
    await fs.mkdir(path.join(coursePath, 'questionSources'), { recursive: true });
    await fs.symlink('questionSources', path.join(coursePath, 'questions'));
    for (const { directory } of contexts) {
      const root = path.join(coursePath, directory);
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(path.join(root, '.Rprofile'), contents);
    }
    await fs.mkdir(path.join(coursePath, '.config/.git'), { recursive: true });
    await fs.writeFile(path.join(coursePath, '.config/.git/config'), 'repository internals');
    await fs.writeFile(path.join(coursePath, '.config/profile.R'), contents);
    await fs.writeFile(path.join(coursePath, 'submission.R'), contents);
    await fs.writeFile(path.join(temporaryPath, 'outside.R'), 'outside course');
    await fs.symlink('.Rprofile', path.join(coursePath, '.profile-link'));
    await fs.symlink('.config/.git', path.join(coursePath, '.repository-link'));
    await fs.symlink('../outside.R', path.join(coursePath, '.outside-link'));
    await fs.symlink(
      '../../../.Rprofile',
      path.join(coursePath, 'questions/test/question/.course-link'),
    );
  });

  afterAll(async () => {
    await fs.rm(temporaryPath, { recursive: true, force: true });
  });

  it.each([
    ...contexts.map(({ navPage, directory }) => [navPage, path.join(directory, '.Rprofile')]),
    ...['submission.R', '.config/profile.R', '.profile-link'].map((filename) => [
      'course_admin',
      filename,
    ]),
  ])('downloads %s: %s', async (navPage, filename) => {
    await withServer(createApp(navPage), async ({ url }) => {
      const response = await fetch(`${downloadUrl(url, filename)}?attachment=profile.R`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="profile.R"');
      assert.equal(await response.text(), contents);
    });
  });

  it.each([
    ['course_admin', '../outside.R', 500],
    ['course_admin', 'questions/test/question/.Rprofile', 500],
    ['course_admin', 'questionSources/test/question/.Rprofile', 404],
    ['instance_admin', 'courseInstances/Fa18/assessments/HW1/.Rprofile', 500],
    ['question', 'questions/test/question/../../../.Rprofile', 500],
    ['question', 'questions/test/question/.course-link', 404],
    ['course_admin', '.config/.git/config', 404],
    ['course_admin', '.repository-link/config', 404],
    ['course_admin', '.outside-link', 404],
    ['course_admin', '.missing', 404],
    ['course_admin', '.config', 404],
    ['course_admin', 'submission.R/child', 404],
  ] as const)('rejects %s: %s', async (navPage, filename, status) => {
    await withServer(createApp(navPage), async ({ url }) => {
      await assertErrorResponse(
        await fetch(`${downloadUrl(url, filename)}?attachment=error.pdf&type=application/pdf`),
        status,
      );
    });
  });

  it('requires course Viewer permission', async () => {
    await withServer(createApp('course_admin', false), async ({ url }) => {
      await assertErrorResponse(
        await fetch(`${downloadUrl(url, '.Rprofile')}?attachment=profile.R`),
        403,
      );
    });
  });

  it('supports previews and ranges, and clears download headers on range errors', async () => {
    await withServer(createApp(), async ({ url }) => {
      const fileUrl = downloadUrl(url, '.Rprofile');
      const preview = await fetch(`${fileUrl}?type=text/plain`);
      assert.equal(preview.status, 200);
      assert.isNull(preview.headers.get('Content-Disposition'));
      assert.equal(preview.headers.get('Content-Type'), 'text/plain; charset=utf-8');
      assert.equal(await preview.text(), contents);

      const partial = await fetch(fileUrl, { headers: { Range: 'bytes=0-6' } });
      assert.equal(partial.status, 206);
      assert.equal(
        partial.headers.get('Content-Range'),
        `bytes 0-6/${Buffer.byteLength(contents)}`,
      );
      assert.equal(await partial.text(), contents.slice(0, 7));

      await assertErrorResponse(
        await fetch(`${fileUrl}?attachment=error.pdf&type=application/pdf`, {
          headers: { Range: 'bytes=10000-' },
        }),
        416,
      );
    });
  });
});
