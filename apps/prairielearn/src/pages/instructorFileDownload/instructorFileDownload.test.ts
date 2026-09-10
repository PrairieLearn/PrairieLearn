import { renameSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import * as path from 'node:path';

import express, { type ErrorRequestHandler } from 'express';
import { afterAll, assert, beforeAll, describe, it, vi } from 'vitest';

import { AugmentedError } from '@prairielearn/error';
import { withServer } from '@prairielearn/express-test-utils';

import cors from '../../middlewares/cors.js';

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
    res
      .status((err as Error & { status?: number }).status ?? 500)
      .send(err instanceof AugmentedError ? err.info : '<h1>Error</h1>');
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
  assert.isNull(response.headers.get('Accept-Ranges'));
  assert.isNull(response.headers.get('Last-Modified'));
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
    ['course_admin', '../outside.R'],
    ['course_admin', 'questions/test/question/.Rprofile'],
    ['course_admin', 'questionSources/test/question/.Rprofile'],
    ['instance_admin', 'courseInstances/Fa18/assessments/HW1/.Rprofile'],
    ['question', 'questions/test/question/../../../.Rprofile'],
    ['question', 'questions/test/question/.course-link'],
    ['course_admin', '.config/.git/config'],
    ['course_admin', '.repository-link/config'],
    ['course_admin', '.outside-link'],
    ['course_admin', '.missing'],
    ['course_admin', '.config'],
    ['course_admin', 'submission.R/child'],
  ])('rejects %s: %s', async (navPage, filename) => {
    await withServer(createApp(navPage), async ({ url }) => {
      await assertErrorResponse(
        await fetch(`${downloadUrl(url, filename)}?attachment=error.pdf&type=application/pdf`),
        404,
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

  it.each(['../outside.R', '.config/.git/config'])(
    'keeps serving the validated file when its path is replaced with a symlink to %s',
    async (target) => {
      const filename = path.join(coursePath, `race-${path.basename(target)}`);
      const replacement = `${filename}.replacement`;
      await fs.writeFile(filename, contents);
      await fs.symlink(target, replacement);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Bound to the response below.
      const originalSendFile = express.response.sendFile;
      using sendFile = vi.spyOn(express.response, 'sendFile').mockImplementation(function (
        this: express.Response,
        ...args
      ) {
        renameSync(replacement, filename);
        return originalSendFile.apply(this, args);
      });

      await withServer(createApp(), async ({ url }) => {
        const response = await fetch(downloadUrl(url, path.basename(filename)));
        assert.equal(response.status, 200);
        assert.equal(await response.text(), contents);
        assert.equal(sendFile.mock.calls.length, 1);
      });
    },
  );

  it('rejects a symlink substituted between validation and opening', async () => {
    const filename = path.join(coursePath, 'opening-race.R');
    await fs.writeFile(filename, contents);
    const originalOpen = fs.open;
    using open = vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      await fs.rename(path.join(coursePath, '.outside-link'), filename);
      return originalOpen(...args);
    });

    await withServer(createApp(), async ({ url }) => {
      await assertErrorResponse(await fetch(downloadUrl(url, 'opening-race.R')), 404);
      assert.equal(open.mock.calls.length, 1);
    });
  });

  it.each([false, true])(
    'supports previews and ranges, and clears download headers on range errors (CORS: %s)',
    async (withCors) => {
      const app = express();
      if (withCors) app.use(cors);
      app.use(createApp());
      await withServer(app, async ({ url }) => {
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

        const rangeError = await fetch(`${fileUrl}?attachment=error.pdf&type=application/pdf`, {
          headers: { Range: 'bytes=10000-' },
        });
        await assertErrorResponse(rangeError, 416);
        assert.notEqual(rangeError.headers.get('ETag'), preview.headers.get('ETag'));
        assert.equal(
          rangeError.headers.get('Cache-Control'),
          withCors ? preview.headers.get('Cache-Control') : null,
        );
      });
    },
  );
});
