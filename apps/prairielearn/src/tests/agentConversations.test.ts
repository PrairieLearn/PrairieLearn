import { TRPCClientError } from '@trpc/client';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { selectUserByUid } from '../models/user.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const siteUrl = `http://localhost:${config.serverPort}`;

async function createClient(cookie = '') {
  assert(config.authUid);
  const authnUserId = (await selectUserByUid(config.authUid)).id;
  return createCourseTrpcClient({
    courseId: '1',
    csrfToken: generatePrefixCsrfToken(
      { authn_user_id: authnUserId, url: getCourseTrpcUrl('1') },
      config.secretKey,
    ),
    extraHeaders: { cookie },
    urlBase: siteUrl,
  });
}

describe('agent conversations authorization', { timeout: 30_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('is unavailable when the feature is disabled', async () => {
    await withConfig({ features: { 'cloud-agent': false } }, async () => {
      await expect((await createClient()).agentConversations.list.query()).rejects.toBeInstanceOf(
        TRPCClientError,
      );
    });
  });

  it('allows an editor to create and list an owned conversation', async () => {
    await withConfig({ features: { 'cloud-agent': true } }, async () => {
      const client = await createClient();
      const created = await client.agentConversations.create.mutate({});
      const listed = await client.agentConversations.list.query();
      expect(listed.conversations.map((conversation) => conversation.id)).toContain(
        created.conversation.id,
      );
    });
  });

  it('rejects a user without course edit permission', async () => {
    await withConfig({ features: { 'cloud-agent': true } }, async () => {
      const client = await createClient(
        'pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
      );
      await expect(client.agentConversations.list.query()).rejects.toBeInstanceOf(TRPCClientError);
    });
  });

  it('rejects effective-user impersonation', async () => {
    await withConfig({ features: { 'cloud-agent': true } }, async () => {
      const client = await createClient(
        'pl2_requested_uid=staff04@example.com; pl2_requested_course_role=Editor',
      );
      await expect(client.agentConversations.list.query()).rejects.toBeInstanceOf(TRPCClientError);
    });
  });
});
