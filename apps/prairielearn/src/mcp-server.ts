#!/usr/bin/env node
//
// Experimental MCP server exposing PrairieLearn to an external agent harness.
//
// LOCAL DEVELOPMENT ONLY. This server performs no authorization checks and is
// scoped to a single course by command-line argument. It refuses to start
// outside a local development environment — see `assertLocalOnly` in
// `mcp/context.ts`.
//
// Usage:
//   tsx src/mcp-server.ts --course-id 2 [--user-uid dev@example.com] [--config path]

import * as os from 'node:os';
import * as path from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import minimist from 'minimist';

import { config } from './lib/config.js';
import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH } from './lib/paths.js';
import {
  McpSafetyError,
  initPrairieLearn,
  resolveCourse,
  shutdownPrairieLearn,
} from './mcp/context.js';
import { createMcpServer } from './mcp/server.js';
import { selectOrInsertUserByUid } from './models/user.js';

// `pnpm run <script> -- --flag` forwards the `--` separator into our argv, and
// minimist would otherwise treat every flag after it as a positional argument.
const argv = minimist(process.argv.slice(2).filter((arg) => arg !== '--'));

const USAGE = `
Usage: mcp-server --course-id <id> [options]

Options:
  --course-id <id>    Required. The course this server operates on.
  --user-uid <uid>    User to act as. Default: dev@example.com
  --config <path>     Config file path. Defaults to the standard locations.
  -h, --help          Show this message.
`.trim();

async function main() {
  if ('h' in argv || 'help' in argv) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  const courseId = argv['course-id'];
  if (!courseId) {
    throw new McpSafetyError('--course-id is required.\n\n' + USAGE);
  }

  const configPaths =
    'config' in argv
      ? [argv.config]
      : [
          path.join(os.homedir(), '.config', 'prairielearn', 'config.json'),
          path.join(REPOSITORY_ROOT_PATH, 'config.json'),
          path.join(APP_ROOT_PATH, 'config.json'),
        ];

  await initPrairieLearn(configPaths);

  const course = await resolveCourse(String(courseId));
  const user = await selectOrInsertUserByUid(argv['user-uid'] ?? 'dev@example.com');

  // stdout is the MCP transport, so all diagnostics go to stderr.
  process.stderr.write(
    'PrairieLearn MCP server ready\n' +
      `  course:   ${course.short_name ?? course.id} (id ${course.id})\n` +
      `  path:     ${course.path}\n` +
      `  user:     ${user.uid}\n` +
      `  database: ${config.postgresqlUser}@${config.postgresqlHost}/${config.postgresqlDatabase}\n`,
  );

  const server = createMcpServer({
    course,
    userId: user.id,
    authnUserId: user.id,
  });

  await server.connect(new StdioServerTransport());

  const shutdown = async () => {
    await server.close().catch(() => {});
    await shutdownPrairieLearn().catch(() => {});
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  if (err instanceof McpSafetyError) {
    process.stderr.write(`\nRefusing to start: ${err.message}\n`);
  } else {
    process.stderr.write(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  }
  process.exit(1);
});
