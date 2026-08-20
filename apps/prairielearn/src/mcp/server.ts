import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { type McpContext } from './context.js';
import { buildInstructions } from './instructions.js';
import { getJobOutput } from './tools/get-job-output.js';
import { ENTITY_SCOPES, listEntities } from './tools/list-entities.js';
import { queryCourseData } from './tools/query-course-data.js';
import { syncCourse } from './tools/sync-course.js';
import { testQuestionTool } from './tools/test-question.js';

/** Serializes a tool result as the JSON text content MCP clients expect. */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorText(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: 'prairielearn', version: '0.1.0' },
    { instructions: buildInstructions(ctx.course) },
  );

  server.registerTool(
    'sync_course',
    {
      title: 'Sync course',
      description:
        'Applies your file edits to PrairieLearn by syncing the course from disk to the ' +
        'database, and returns any errors. Call this after every batch of edits — nothing ' +
        'you write to disk takes effect until you do. Reports JSON schema violations, ' +
        'dangling QID references, duplicate UUIDs, and undeclared topics or tags.',
      inputSchema: {},
    },
    async () => {
      try {
        return json(await syncCourse(ctx.course));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    'list_entities',
    {
      title: 'List course entities',
      description:
        'Lists questions, course instances, or assessments with both their database IDs ' +
        'and their paths on disk. Use this to map between a file you edited (addressed by ' +
        'qid or tid) and the rows describing it in the database (addressed by numeric ID).',
      inputSchema: {
        scope: z.enum(ENTITY_SCOPES).describe('Which kind of entity to list.'),
      },
    },
    async ({ scope }) => {
      try {
        return json(await listEntities({ course: ctx.course, scope }));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    'test_question',
    {
      title: 'Test question',
      description:
        'Renders a question across random variants and submits correct, incorrect, and ' +
        'invalid answers to each, returning failures with the variant seed that produced ' +
        'them. Run this on every question you create or modify — a question can sync ' +
        'cleanly and still be broken for some random variants. The question must be ' +
        'synced first.',
      inputSchema: {
        qid: z
          .string()
          .describe('Question ID — its path under questions/, e.g. "topic/my-question".'),
        count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(5)
          .describe(
            'Iterations of each test type (correct, incorrect, invalid). 5 is a good ' +
              'default; use 25+ to hunt for seed-dependent bugs.',
          ),
        seedPrefix: z
          .string()
          .optional()
          .describe(
            'Makes variant seeds deterministic as "{prefix}-{n}". Pass the same prefix ' +
              'again to reproduce a specific failure.',
          ),
      },
    },
    async ({ qid, count, seedPrefix }) => {
      try {
        return json(
          await testQuestionTool({
            course: ctx.course,
            qid,
            count,
            seedPrefix,
            userId: ctx.userId,
            authnUserId: ctx.authnUserId,
          }),
        );
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    'query_course_data',
    {
      title: 'Query course data',
      description:
        'Runs a read-only SQL query against the PrairieLearn database: student ' +
        'submissions, question statistics, issues, gradebook. A single SELECT or WITH ' +
        "statement, capped at 1000 rows. See this server's instructions for the joins " +
        'that are easy to get wrong (group work, soft deletes, staff submissions).',
      inputSchema: {
        query: z.string().describe('A single read-only SQL statement.'),
      },
    },
    async ({ query }) => {
      try {
        return json(await queryCourseData(query));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    'get_job_output',
    {
      title: 'Get job output',
      description:
        'Reads the output of a PrairieLearn job sequence. Long-running operations run as ' +
        'job sequences; use this to inspect one you did not run inline.',
      inputSchema: {
        jobSequenceId: z.string().describe('The job sequence ID.'),
      },
    },
    async ({ jobSequenceId }) => {
      try {
        return json(await getJobOutput({ course: ctx.course, jobSequenceId }));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  return server;
}
