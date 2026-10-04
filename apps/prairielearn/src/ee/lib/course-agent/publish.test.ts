import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { test } from 'vitest';

import { ChatError, proposalContent } from '@prairielearn/course-agent-contract';

import { type Publication, PublishRejected, Publisher } from './publish.js';

function job(): Publication {
  const files = [
    {
      path: 'hello.txt',
      content: 'new\n',
      previousMode: '100644',
      mode: '100644',
    },
  ];
  const baseSha = 'a'.repeat(40),
    proposedSha = 'b'.repeat(40);
  return {
    id: randomUUID(),
    sequence: 1,
    destination: { repository: 'example/course', branch: 'main' },
    createdAt: new Date().toISOString(),
    approval: {
      id: randomUUID(),
      baseSha,
      proposedSha,
      files,
      diff: 'untrusted visual diff',
      digest: createHash('sha256')
        .update(proposalContent(baseSha, proposedSha, files))
        .digest('hex'),
      status: 'pending',
    },
  };
}

function github(value: Publication) {
  const commits = [{ oid: value.approval.baseSha, message: 'base' }];
  let pushes = 0;
  let loseAck = false;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes('/git/commits/')) {
      return Response.json({
        parents: [{ sha: value.approval.baseSha }],
        tree: { sha: 'result-tree' },
      });
    }
    if (String(url).includes('/git/trees/result-tree')) {
      return Response.json({
        truncated: false,
        tree: value.approval.files
          .filter((f) => f.content !== null)
          .map((f) => {
            const b = Buffer.from(f.content!);
            return {
              path: f.path,
              mode: f.mode,
              type: 'blob',
              sha: createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'),
            };
          }),
      });
    }
    if (String(url).includes('/git/trees/')) {
      return Response.json({
        truncated: false,
        tree: [{ path: 'hello.txt', mode: '100644', sha: 'blob', type: 'blob' }],
      });
    }
    if (String(url).includes('/git/blobs/')) {
      return Response.json({
        encoding: 'base64',
        content: Buffer.from('old\n').toString('base64'),
      });
    }
    const body = JSON.parse(String(init?.body));
    if (body.query.startsWith('query')) {
      return Response.json({
        data: {
          repository: {
            ref: {
              target: {
                history: { nodes: commits, pageInfo: { hasNextPage: false } },
              },
            },
          },
        },
      });
    }
    const input = body.variables.input;
    assert.equal(input.expectedHeadOid, value.approval.baseSha);
    assert.deepEqual(input.fileChanges.additions, [
      { path: 'hello.txt', contents: Buffer.from('new\n').toString('base64') },
    ]);
    if (commits[0].oid !== input.expectedHeadOid) {
      return Response.json({ errors: [{ message: 'head changed' }] });
    }
    pushes++;
    commits.unshift({
      oid: 'c'.repeat(40),
      message: `${input.message.headline}\n\n${input.message.body}`,
    });
    if (loseAck) throw new Error('response lost after commit');
    return Response.json({
      data: { createCommitOnBranch: { commit: { oid: commits[0].oid } } },
    });
  };
  return {
    fetcher,
    pushes: () => pushes,
    loseAck: () => {
      loseAck = true;
    },
    advance: () =>
      commits.unshift({
        oid: 'd'.repeat(40),
        message: 'unrelated later commit',
      }),
  };
}
test('publishes saved contents and generates the diff from the same files', async () => {
  const value = job(),
    fake = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: fake.fetcher,
  });
  value.candidate = await publisher.prepare(value);
  assert.match(value.approval.diff, /-old\n\+new/);
  assert.equal(await publisher.push(value), 'c'.repeat(40));
  assert.equal(await publisher.push(value), 'c'.repeat(40));
  assert.equal(fake.pushes(), 1);
});
test('retry rediscovers a lost commit acknowledgment after main advances', async () => {
  const value = job(),
    fake = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: fake.fetcher,
  });
  value.candidate = await publisher.prepare(value);
  fake.loseAck();
  await assert.rejects(publisher.push(value), /publication outcome is unconfirmed/);
  fake.advance();
  assert.equal(await publisher.push(value), 'c'.repeat(40));
  assert.equal(fake.pushes(), 1);
});
test('concurrent branch changes never overwrite main', async () => {
  const value = job(),
    fake = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: fake.fetcher,
  });
  value.candidate = await publisher.prepare(value);
  fake.advance();
  await assert.rejects(publisher.push(value), /branch changed/);
  assert.equal(fake.pushes(), 0);
});
test('proposal tampering and unsupported modes are rejected before publication', async () => {
  const value = job(),
    fake = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: fake.fetcher,
  });
  value.approval.files[0].content = 'changed';
  await assert.rejects(publisher.prepare(value), /hash mismatch/);
  value.approval.files[0].mode = '100755';
  value.approval.digest = createHash('sha256')
    .update(
      proposalContent(value.approval.baseSha, value.approval.proposedSha, value.approval.files),
    )
    .digest('hex');
  await assert.rejects(publisher.prepare(value), /ordinary text/);
});

test('GitHub failures expose safe actionable errors', async () => {
  const value = job();
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: async () => new Response('private upstream contents', { status: 403 }),
  });
  await assert.rejects(publisher.prepare(value), (error: unknown) => {
    assert.ok(error instanceof PublishRejected);
    assert.match(error.message, /403.*repository access/);
    assert.doesNotMatch(error.message, /private upstream/);
    return true;
  });
});

test('JSONB property reordering preserves the approved digest', async () => {
  const value = job();
  const file = value.approval.files[0];
  value.approval.files = [
    {
      mode: file.mode,
      previousMode: file.previousMode,
      content: file.content,
      path: file.path,
    },
  ];
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: github(value).fetcher,
  });
  assert.equal(await publisher.prepare(value), value.approval.digest);
});

test('defers course-instance schema and JSON validation to Course Sync', async () => {
  const publication = job();
  publication.approval.files = [
    {
      path: 'courseInstances/Fall2026/infoCourseInstance.json',
      previousMode: '000000',
      mode: '100644',
      content: JSON.stringify({
        uuid: randomUUID(),
        longName: 'Fall 2026',
        timeZone: 'Etc/UTC',
        allowAccess: [],
      }),
    },
  ];
  const { baseSha, proposedSha, files } = publication.approval;
  publication.approval.digest = createHash('sha256')
    .update(proposalContent(baseSha, proposedSha, files))
    .digest('hex');
  const publisher = new Publisher(publication.destination, {
    token: 'fixture',
    fetch: async () => Response.json({ truncated: false, tree: [] }),
  });
  assert.equal(await publisher.prepare(publication), publication.approval.digest);
  publication.approval.files[0].content = JSON.stringify({
    uuid: randomUUID(),
    longName: 'Fall 2026',
    timezone: 'Etc/UTC',
    allowAccess: [],
  });
  publication.approval.digest = createHash('sha256')
    .update(proposalContent(baseSha, proposedSha, files))
    .digest('hex');
  publication.approval.files[0].content = '{invalid JSON';
  publication.approval.digest = createHash('sha256')
    .update(proposalContent(baseSha, proposedSha, files))
    .digest('hex');
  assert.equal(await publisher.prepare(publication), publication.approval.digest);
});

test.each(['retry-after', 'x-ratelimit-remaining'])(
  'keeps GitHub throttling retryable even when it returns 403',
  async (header) => {
    const value = job();
    const publisher = new Publisher(value.destination, {
      token: 'test',
      fetch: async () =>
        new Response('private upstream contents', {
          status: 403,
          headers: { [header]: header === 'retry-after' ? '60' : '0' },
        }),
    });
    await assert.rejects(publisher.prepare(value), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.message, /private upstream/);
      return true;
    });
  },
);

test('rejects a deleted binary base blob permanently instead of offering identical retries', async () => {
  const value = job();
  value.approval.files = [
    { path: 'hello.txt', content: null, previousMode: '100644', mode: '000000' },
  ];
  value.approval.digest = createHash('sha256')
    .update(
      proposalContent(value.approval.baseSha, value.approval.proposedSha, value.approval.files),
    )
    .digest('hex');
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: async (url) =>
      String(url).includes('/git/trees/')
        ? Response.json({
            truncated: false,
            tree: [{ path: 'hello.txt', mode: '100644', sha: 'blob' }],
          })
        : Response.json({ encoding: 'base64', content: Buffer.from([0, 255]).toString('base64') }),
  });
  await assert.rejects(
    publisher.prepare(value),
    (error) => error instanceof PublishRejected && error.message.includes('UTF-8 text files'),
  );
});

test.each(['FORBIDDEN', 'NOT_FOUND', 'UNPROCESSABLE'])(
  'returns a definite GraphQL %s rejection without identical retries',
  async (type) => {
    const value = job();
    const fixture = github(value);
    const publisher = new Publisher(value.destination, {
      token: 'test',
      fetch: async (url, init) => {
        if (
          String(url).endsWith('/graphql') &&
          JSON.parse(String(init?.body)).query.startsWith('mutation')
        ) {
          return Response.json({
            errors: [{ type, path: ['createCommitOnBranch'], message: 'private upstream text' }],
            data: { createCommitOnBranch: null },
          });
        }
        return fixture.fetcher(url, init);
      },
    });
    value.candidate = await publisher.prepare(value);
    await assert.rejects(
      publisher.push(value),
      (error) => error instanceof PublishRejected && !error.message.includes('private upstream'),
    );
  },
);

test('keeps unknown GraphQL mutation failures unconfirmed for receipt reconciliation', async () => {
  const value = job();
  const fixture = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: async (url, init) => {
      if (
        String(url).endsWith('/graphql') &&
        JSON.parse(String(init?.body)).query.startsWith('mutation')
      ) {
        return Response.json({ errors: [{ type: 'INTERNAL', path: ['createCommitOnBranch'] }] });
      }
      return fixture.fetcher(url, init);
    },
  });
  value.candidate = await publisher.prepare(value);
  await assert.rejects(publisher.push(value), (error) => error instanceof ChatError);
});

test('a deleted branch ends completion with an explicit unverified-prior-publication result', async () => {
  const value = job();
  value.candidate = value.approval.digest;
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: async () => Response.json({ data: { repository: { ref: null } } }),
  });
  await assert.rejects(
    publisher.push(value),
    (error) =>
      error instanceof PublishRejected &&
      error.message.includes('Prior publication could not be verified'),
  );
});

test('rejects a rendered diff larger than its schema budget even when raw content fits', async () => {
  const value = job();
  value.approval.files = [
    { path: 'hello.txt', content: null, previousMode: '100644', mode: '000000' },
  ];
  value.approval.digest = createHash('sha256')
    .update(
      proposalContent(value.approval.baseSha, value.approval.proposedSha, value.approval.files),
    )
    .digest('hex');
  const fixture = github(value);
  const publisher = new Publisher(value.destination, {
    token: 'test',
    fetch: async (url, init) =>
      String(url).includes('/git/blobs/')
        ? Response.json({
            encoding: 'base64',
            content: Buffer.from('a\n'.repeat(131000)).toString('base64'),
          })
        : fixture.fetcher(url, init),
  });
  await assert.rejects(
    publisher.prepare(value),
    (error) => error instanceof PublishRejected && error.message.includes('rendered diff exceeds'),
  );
});
