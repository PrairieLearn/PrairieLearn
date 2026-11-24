import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';

import type { McpAuth } from './auth.js';
import { getSkillCatalog, listSkills, readSkillFile } from './skills.js';

function reply(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

async function buildInstructions() {
  const skills = await listSkills();
  return [
    'PrairieLearn is a platform for online assessments. Use these tools to help course staff with their PrairieLearn course.',
    "Use PrairieLearn's own terms, and look up anything these tools and skills do not cover in its documentation at docs.prairielearn.com.",
    'Before starting a task that matches one of these skills, read it with get_skill, unless your environment has already loaded it from this server:',
    ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
  ].join('\n');
}

async function getSkill({ name, path }: { name?: string; path?: string }) {
  if (name === undefined) {
    const skills = await listSkills();
    return reply(
      ['Skills:', ...skills.map((skill) => `- ${skill.name}: ${skill.description}`)].join('\n'),
    );
  }
  const file = await readSkillFile(name, path);
  if (file === null) {
    return reply(
      path === undefined
        ? `There is no skill named "${name}". Call get_skill with no arguments to list the skills.`
        : `The skill "${name}" has no file "${path}". Call get_skill with only the name to list its files.`,
      true,
    );
  }
  if (path !== undefined) return reply(file.text);
  const others = file.files.filter((other) => other !== 'SKILL.md');
  return reply(
    [
      file.text,
      ...(others.length > 0
        ? ['', 'Other files in this skill, which get_skill returns by path:', ...others]
        : []),
    ].join('\n'),
  );
}

/** A server for one request, acting for the user and within the limits of `auth`. */
export async function buildMcpServer(auth: McpAuth) {
  const server = new McpServer(
    { name: 'prairielearn', title: 'PrairieLearn', version: '0.1.0' },
    {
      instructions: await buildInstructions(),
      // The tools and skills only change with a deploy. Saying so keeps agents from holding a
      // request open to wait for changes.
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
    },
  );

  // Agents that support the skills extension find and load the skills themselves. get_skill
  // stays for the ones that do not.
  (await getSkillCatalog()).attach(server);

  server.registerTool(
    'get_skill',
    {
      title: 'Get a PrairieLearn skill',
      description:
        "Read PrairieLearn's instructions for a kind of task, such as writing questions. With no arguments, lists the skills. With a name, returns that skill's instructions and the names of its other files. With a name and a path, returns one of those files.",
      inputSchema: z.strictObject({
        name: z.string().optional().describe('The skill to read.'),
        path: z
          .string()
          .optional()
          .describe("One of the skill's other files, as listed with its instructions."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = await getSkill(args);
      logger.info('MCP tool call', {
        tool: 'get_skill',
        outcome: result.isError ? 'error' : 'ok',
        user_id: auth.user_id,
        oauth_grant_id: auth.oauth_grant_id,
        skill: args.name,
        path: args.path,
      });
      return result;
    },
  );

  return server;
}
