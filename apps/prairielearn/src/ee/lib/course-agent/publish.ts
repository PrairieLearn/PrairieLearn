import { createHash } from 'node:crypto';

import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';

import { type Approval, ChatError, proposalContent } from '@prairielearn/course-agent-contract';

import { AssessmentJsonSchema } from '../../../schemas/infoAssessment.js';
import { CourseJsonSchema } from '../../../schemas/infoCourse.js';
import { CourseInstanceJsonSchema } from '../../../schemas/infoCourseInstance.js';
import { QuestionJsonSchema } from '../../../schemas/infoQuestion.js';

const EMPTY_BASE = '0'.repeat(40);
export interface Destination {
  repository: string;
  branch: string;
}

export interface Publication {
  id: string;
  sequence: number;
  destination: Destination;
  approval: Approval;
  createdAt: string;
  candidate?: string;
  error?: string;
}
export class PublishRejected extends Error {}

/** Publish immutable file contents using GitHub APIs. No checkout or Git executable runs in the PL webserver. */
export class Publisher {
  private destination: Destination;
  private options: { token: string; fetch?: typeof fetch };
  constructor(destination: Destination, options: { token: string; fetch?: typeof fetch }) {
    this.destination = destination;
    this.options = options;
  }

  private async request(path: string, body?: unknown) {
    const response = await (this.options.fetch ?? fetch)(`https://api.github.com${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new ChatError(
        502,
        'GitHub connection failed; publication outcome is unconfirmed. Retry completion.',
      );
    });
    // Do not forward provider response text: request errors can contain credentials or repository contents.
    if (!response.ok) {
      const rateLimited =
        response.headers.has('retry-after') ||
        response.headers.get('x-ratelimit-remaining') === '0';
      if (!rateLimited && [400, 401, 403, 404, 422].includes(response.status)) {
        throw new PublishRejected(
          `GitHub rejected the request (${response.status}). Check repository access and branch protection before submitting a new proposal.`,
        );
      }
      throw new ChatError(
        502,
        `GitHub request failed (${response.status}). Check repository access and branch protection, then Retry.`,
      );
    }
    return response.json();
  }

  /** Verify trusted base blobs and generate the visual diff from exactly the saved publication files. */
  async prepare(job: Publication): Promise<string> {
    const { approval } = job;
    const digest = createHash('sha256')
      .update(proposalContent(approval.baseSha, approval.proposedSha, approval.files))
      .digest('hex');
    if (digest !== approval.digest) throw new PublishRejected('Proposal hash mismatch.');
    if (approval.baseSha === EMPTY_BASE) {
      throw new PublishRejected(
        'Initialize the course repository with a commit on main before requesting publication.',
      );
    }
    const root = `/repos/${this.destination.repository}`;
    const tree = (await this.request(`${root}/git/trees/${approval.baseSha}?recursive=1`)) as {
      truncated: boolean;
      tree: { path: string; mode: string; sha: string }[];
    };
    if (tree.truncated) throw new PublishRejected('Repository tree exceeds supported limits.');
    const seen = new Set<string>();
    let diff = '';
    let bytes = 0;
    for (const file of approval.files) {
      const components = file.path.split('/');
      if (
        seen.has(file.path) ||
        components.some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git') ||
        components[0]?.toLowerCase() === '.github' ||
        // Publication paths must not contain control characters.
        // eslint-disable-next-line no-control-regex
        /[\x00-\x1f\\]/.test(file.path)
      ) {
        throw new PublishRejected('Invalid or duplicate publication path.');
      }
      seen.add(file.path);
      const previous = tree.tree.find((entry) => entry.path === file.path);
      // createCommitOnBranch has no file-mode parameter. Keep this MVP to ordinary text files.
      if (
        (previous?.mode ?? '000000') !== file.previousMode ||
        !['000000', '100644'].includes(file.previousMode) ||
        file.mode !== (file.content === null ? '000000' : '100644')
      ) {
        throw new PublishRejected(
          'Only ordinary text files are supported; executable files, symlinks, submodules and mode changes need a new proposal.',
        );
      }
      if (!previous && file.content === null) {
        throw new PublishRejected('Deleted file is absent from the base commit.');
      }
      let before = '';
      if (previous) {
        const blob = (await this.request(`${root}/git/blobs/${previous.sha}`)) as {
          content: string;
          encoding: string;
        };
        if (blob.encoding !== 'base64') {
          throw new PublishRejected('Unsupported GitHub blob encoding.');
        }
        try {
          before = new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.from(blob.content, 'base64'),
          );
        } catch {
          throw new PublishRejected(
            `${file.path}: only UTF-8 text files are supported. Prepare a proposal without this binary file.`,
          );
        }
      }
      if (file.content !== null) {
        const schema =
          file.path === 'infoCourse.json'
            ? CourseJsonSchema
            : /^courseInstances\/[^/]+\/infoCourseInstance\.json$/.test(file.path)
              ? CourseInstanceJsonSchema
              : /^courseInstances\/[^/]+\/assessments\/.+\/infoAssessment\.json$/.test(file.path)
                ? AssessmentJsonSchema
                : /^questions\/.+\/infoQuestion\.json$/.test(file.path)
                  ? QuestionJsonSchema
                  : undefined;
        if (schema) {
          let value: unknown;
          try {
            value = JSON.parse(file.content);
          } catch {
            throw new PublishRejected(
              `${file.path}: invalid JSON. Correct the file and submit a new proposal.`,
            );
          }
          const result = schema.safeParse(value);
          if (!result.success) {
            throw new PublishRejected(
              `${file.path}: ${z.prettifyError(result.error)}. Correct the file and submit a new proposal.`,
            );
          }
        }
      }
      const after = file.content ?? '';
      bytes += Buffer.byteLength(before) + Buffer.byteLength(after);
      if (bytes > 262144 || before.includes('\0') || after.includes('\0')) {
        throw new PublishRejected('Only text proposals up to 256 KiB are supported.');
      }
      diff += createTwoFilesPatch(
        previous ? `a/${file.path}` : '/dev/null',
        file.content === null ? '/dev/null' : `b/${file.path}`,
        before,
        after,
      );
    }
    if (seen.size === 0) throw new PublishRejected('Proposal contains no changes.');
    approval.diff = diff;
    return approval.digest;
  }

  /** Find an acknowledged-or-uncertain earlier commit in branch history before attempting another write. */
  private async published(job: Publication): Promise<string | undefined> {
    let cursor: string | null = null;
    let first = true;
    let pages = 0;
    do {
      if (++pages > 10) {
        throw new PublishRejected(
          'Publication history exceeds reconciliation limit; operator review required.',
        );
      }
      const result = (await this.request('/graphql', {
        query:
          'query($owner:String!,$name:String!,$ref:String!,$cursor:String){repository(owner:$owner,name:$name){ref(qualifiedName:$ref){target{... on Commit{history(first:100,after:$cursor){nodes{oid message} pageInfo{hasNextPage endCursor}}}}}}}',
        variables: {
          owner: this.destination.repository.split('/')[0],
          name: this.destination.repository.split('/')[1],
          ref: `refs/heads/${this.destination.branch}`,
          cursor,
        },
      })) as {
        errors?: unknown;
        data?: {
          repository?: {
            ref?: {
              target: {
                history: {
                  nodes: { oid: string; message: string }[];
                  pageInfo: { hasNextPage: boolean; endCursor: string };
                };
              };
            };
          };
        };
      };
      const history = result.data?.repository?.ref?.target.history;
      if (result.errors || !history) {
        throw new ChatError(
          502,
          'Could not inspect GitHub branch history. Initialize the branch and check access.',
        );
      }
      for (const commit of history.nodes) {
        if (commit.message.trimEnd() === this.message(job)) {
          const candidate = (await this.request(
            `${'/repos/'}${this.destination.repository}/git/commits/${commit.oid}`,
          )) as { parents: { sha: string }[]; tree: { sha: string } };
          if (
            candidate.parents.length !== 1 ||
            candidate.parents[0]?.sha !== job.approval.baseSha
          ) {
            throw new PublishRejected('Prior publication could not be verified.');
          }
          const base = (await this.request(
            `/repos/${this.destination.repository}/git/trees/${job.approval.baseSha}?recursive=1`,
          )) as {
            truncated: boolean;
            tree: { path: string; mode: string; sha: string; type: string }[];
          };
          const after = (await this.request(
            `/repos/${this.destination.repository}/git/trees/${candidate.tree.sha}?recursive=1`,
          )) as typeof base;
          if (base.truncated || after.truncated) {
            throw new PublishRejected('Prior publication tree could not be verified.');
          }
          const expected = new Map(
            base.tree.filter((x) => x.type !== 'tree').map((x) => [x.path, `${x.mode}:${x.sha}`]),
          );
          for (const file of job.approval.files) {
            if (file.content === null) {
              expected.delete(file.path);
            } else {
              const bytes = Buffer.from(file.content);
              const sha = createHash('sha1')
                .update(`blob ${bytes.length}\0`)
                .update(bytes)
                .digest('hex');
              expected.set(file.path, `${file.mode}:${sha}`);
            }
          }
          const actual = after.tree.filter((x) => x.type !== 'tree');
          if (
            actual.length !== expected.size ||
            actual.some((x) => expected.get(x.path) !== `${x.mode}:${x.sha}`)
          ) {
            throw new PublishRejected('Prior publication differs from the approved files.');
          }
          return commit.oid;
        }
        if (commit.oid === job.approval.baseSha) {
          if (first) return;
          throw new PublishRejected(
            'The branch changed since this proposal. Fetch and prepare a new proposal.',
          );
        }
        first = false;
      }
      cursor = history.pageInfo.hasNextPage ? history.pageInfo.endCursor : null;
    } while (cursor);
    throw new PublishRejected(
      'The approved base is no longer in branch history. Prepare a new proposal.',
    );
  }

  /** Undo only this publication with a new commit, fenced against concurrent branch changes. */
  private message(job: Publication) {
    return `Approved course-agent change ${job.id}\n\nProposal: ${job.approval.digest}`;
  }

  /** expectedHeadOid prevents overwriting concurrent changes. Unknown outcomes remain retryable. */
  async push(job: Publication): Promise<string> {
    if (!job.candidate) throw new Error('Proposal has not been validated.');
    const prior = await this.published(job);
    if (prior) return prior;
    const result = (await this.request('/graphql', {
      query:
        'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',
      variables: {
        input: {
          branch: {
            repositoryNameWithOwner: job.destination.repository,
            branchName: job.destination.branch,
          },
          expectedHeadOid: job.approval.baseSha,
          message: {
            headline: `Approved course-agent change ${job.id}`,
            body: `Proposal: ${job.approval.digest}`,
          },
          fileChanges: {
            additions: job.approval.files
              .filter((f) => f.content !== null)
              .map((f) => ({
                path: f.path,
                contents: Buffer.from(f.content!).toString('base64'),
              })),
            deletions: job.approval.files
              .filter((f) => f.content === null)
              .map((f) => ({ path: f.path })),
          },
        },
      },
    })) as {
      errors?: unknown;
      data?: { createCommitOnBranch?: { commit: { oid: string } } };
    };
    if (result.errors || !result.data?.createCommitOnBranch) {
      throw new ChatError(
        502,
        'GitHub did not confirm publication. Retry completion to reconcile the outcome.',
      );
    }
    return result.data.createCommitOnBranch.commit.oid;
  }
}
