import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeConductorConfigSource } from './conductor.js';

describe('makeConductorConfigSource', () => {
  const originalPort = process.env.CONDUCTOR_PORT;
  const originalWorkspaceName = process.env.CONDUCTOR_WORKSPACE_NAME;

  beforeEach(() => {
    delete process.env.CONDUCTOR_PORT;
    delete process.env.CONDUCTOR_WORKSPACE_NAME;
  });

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env.CONDUCTOR_PORT;
    } else {
      process.env.CONDUCTOR_PORT = originalPort;
    }

    if (originalWorkspaceName === undefined) {
      delete process.env.CONDUCTOR_WORKSPACE_NAME;
    } else {
      process.env.CONDUCTOR_WORKSPACE_NAME = originalWorkspaceName;
    }
  });

  it('does nothing outside a Conductor workspace', async () => {
    await expect(makeConductorConfigSource().load({})).resolves.toEqual({});
  });

  it('derives expected config', async () => {
    process.env.CONDUCTOR_PORT = '4010';
    process.env.CONDUCTOR_WORKSPACE_NAME = 'Feature/My Branch!';

    await expect(
      makeConductorConfigSource({ portConfigKey: 'serverPort' }).load({}),
    ).resolves.toEqual({
      serverPort: '4010',
      postgresqlDatabase: 'prairielearn_feature_my_branch_',
      redisUrl: 'redis://localhost:6379/2',
    });
  });

  it('normalizes Redis config for a Conductor port below 3000', async () => {
    process.env.CONDUCTOR_PORT = '2999';
    process.env.CONDUCTOR_WORKSPACE_NAME = 'my-workspace';

    await expect(makeConductorConfigSource().load({})).resolves.toMatchObject({
      redisUrl: 'redis://localhost:6379/15',
    });
  });
});
