import { Readable } from 'node:stream';

import { ECR } from '@aws-sdk/client-ecr';
import Docker from 'dockerode';
import { afterEach, expect, it, vi } from 'vitest';

import * as dockerUtils from '@prairielearn/docker-utils';
import { withResolvers } from '@prairielearn/utils';

import * as serverJobs from '../../lib/server-jobs.js';
import { withConfig } from '../../tests/utils/config.js';

import { ecrUpdate } from './syncHelpers.js';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  'syncs all images serially and reports failures at the end (first image fails: %s)',
  async (firstImageFails) => {
    vi.spyOn(dockerUtils, 'setupDockerAuth').mockResolvedValue({
      username: 'AWS',
      password: 'test',
    });
    vi.spyOn(ECR.prototype, 'describeRepositories').mockImplementation(async () => ({
      $metadata: {},
      repositories: [{ repositoryName: 'org/first' }, { repositoryName: 'org/second' }],
    }));
    const firstPull = withResolvers<NodeJS.ReadableStream>();
    const pullError = new Error('Image not found');
    const createImage = vi
      .spyOn(Docker.prototype, 'createImage')
      .mockReturnValueOnce(firstPull.promise)
      .mockImplementation(async () => Readable.from([]));
    const image = new Docker().getImage('test');
    vi.spyOn(image, 'tag').mockResolvedValue(undefined);
    const push = vi.spyOn(image, 'push').mockImplementation(async () => Readable.from([]));
    vi.spyOn(Docker.prototype, 'getImage').mockReturnValue(image);
    const executeInBackground = vi.fn<serverJobs.ServerJobExecutor['executeInBackground']>();
    vi.spyOn(serverJobs, 'createServerJob').mockResolvedValue({
      jobSequenceId: '1',
      execute: vi.fn(),
      executeUnsafe: vi.fn(),
      executeInBackground,
    });
    const job = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      verbose: vi.fn(),
      data: {},
      exec: vi.fn(),
      stop: vi.fn<serverJobs.ServerJob['stop']>(),
      fail: vi.fn((message: string): never => {
        throw new Error(message);
      }),
    };

    await withConfig({ cacheImageRegistry: 'cache.example.com' }, async () => {
      await ecrUpdate([{ image: 'org/first' }, { image: 'org/second' }], {
        user: { id: '1' },
        authz_data: { authn_user: { id: '1' } },
        course: { id: '1' },
      });
      const completion = executeInBackground.mock.calls[0][0](job).catch((err: unknown) => err);
      expect(createImage).toHaveBeenCalledTimes(1);
      expect(job.fail).not.toHaveBeenCalled();

      if (firstImageFails) {
        firstPull.reject(pullError);
      } else {
        firstPull.resolve(Readable.from([]));
      }

      expect(await completion).toEqual(
        firstImageFails ? new Error('Failed to sync 1 of 2 images: org/first') : undefined,
      );
      expect(job.error.mock.calls).toEqual(
        firstImageFails ? [[`Failed to sync org/first: ${pullError.stack}`]] : [],
      );
      expect(job.fail).toHaveBeenCalledTimes(firstImageFails ? 1 : 0);
      expect(createImage).toHaveBeenCalledTimes(2);
      expect(createImage).toHaveBeenNthCalledWith(2, { fromImage: 'org/second', tag: 'latest' });
      expect(push).toHaveBeenCalledTimes(firstImageFails ? 1 : 2);
      expect(job.info).toHaveBeenLastCalledWith('Push complete');
    });
  },
);
