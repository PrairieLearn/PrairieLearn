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

  it('maps the Conductor port to the configured key', async () => {
    process.env.CONDUCTOR_PORT = '4010';

    await expect(
      makeConductorConfigSource({ portConfigKey: 'serverPort' }).load({}),
    ).resolves.toEqual({ serverPort: '4010' });
  });

  it('derives workspace-specific database and Redis config', async () => {
    process.env.CONDUCTOR_PORT = '4010';
    process.env.CONDUCTOR_WORKSPACE_NAME = 'Feature/My Branch!';

    await expect(makeConductorConfigSource().load({})).resolves.toEqual({
      postgresqlDatabase: 'prairielearn_feature_my_branch_',
      redisUrl: 'redis://localhost:6379/2',
    });
  });

  it('uses the default PrairieLearn port when deriving Redis config without a port', async () => {
    process.env.CONDUCTOR_WORKSPACE_NAME = 'my-workspace';

    await expect(makeConductorConfigSource().load({})).resolves.toEqual({
      postgresqlDatabase: 'prairielearn_my_workspace',
      redisUrl: 'redis://localhost:6379/0',
    });
  });
});
