import { randomUUID } from 'node:crypto';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const toolBaseUrl = 'http://prairielearn.internal/tools';

export async function callPrairieLearnTool(
  name,
  input,
  expectedRevision,
  operationId = randomUUID(),
) {
  const response = await fetch(`${toolBaseUrl}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operation_id: operationId,
      input,
      expected_revision: expectedRevision,
    }),
  });
  if (!response.ok) throw new Error(`PrairieLearn tool ${name} failed: ${await response.text()}`);
  return await response.json();
}

export function createPrairieLearnMcpServer(allowedTools) {
  const tools = allowedTools.map((name) =>
    tool(name, toolDefinitions[name].description, toolDefinitions[name].schema, async (input) => {
      const result = await callPrairieLearnTool(name, input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }),
  );
  return createSdkMcpServer({ name: 'prairielearn', version: '1.0.0', tools });
}

const toolDefinitions = {
  list_entities: {
    description: 'List PrairieLearn questions, course instances, or assessments in this course.',
    schema: { scope: z.enum(['questions', 'course_instances', 'assessments']) },
  },
  read_course_file: {
    description: 'Read one UTF-8 file using its course-relative path.',
    schema: { path: z.string().min(1) },
  },
  query_course_data: {
    description: 'Run one development-only read-only SELECT or WITH query against course data.',
    schema: { query: z.string().min(1) },
  },
  render_question: {
    description: 'Render a committed question from the sandbox for preview and validation.',
    schema: { qid: z.string().min(1), variant_seed: z.string().optional() },
  },
  get_job_output: {
    description: 'Read output for a PrairieLearn background job by sequence ID.',
    schema: { job_sequence_id: z.string().min(1) },
  },
};
