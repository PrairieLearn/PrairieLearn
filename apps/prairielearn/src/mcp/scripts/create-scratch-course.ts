#!/usr/bin/env node
//
// Creates a scratch course for the agent to work on, seeded from `testCourse`.
//
// The course is copied OUTSIDE the PrairieLearn repository so that agent edits
// can never dirty PrairieLearn's own working tree. Local development only.
//
// Usage:
//   tsx src/mcp/scripts/create-scratch-course.ts [--dest <path>] [--short-name QA]

import * as os from 'node:os';
import * as path from 'node:path';

import fs from 'fs-extra';
import minimist from 'minimist';

import { config } from '../../lib/config.js';
import { APP_ROOT_PATH, REPOSITORY_ROOT_PATH, TEST_COURSE_PATH } from '../../lib/paths.js';
import { insertCourse, selectOptionalCourseByPath } from '../../models/course.js';
import { selectOrInsertUserByUid } from '../../models/user.js';
import { syncDiskToSql } from '../../sync/syncFromDisk.js';
import { initPrairieLearn, shutdownPrairieLearn } from '../context.js';

// `pnpm run <script> -- --flag` forwards the `--` separator into our argv, and
// minimist would otherwise treat every flag after it as a positional argument.
const argv = minimist(process.argv.slice(2).filter((arg) => arg !== '--'));

async function main() {
  const configPaths = [
    path.join(os.homedir(), '.config', 'prairielearn', 'config.json'),
    path.join(REPOSITORY_ROOT_PATH, 'config.json'),
    path.join(APP_ROOT_PATH, 'config.json'),
  ];

  await initPrairieLearn(configPaths);

  const dest: string = argv.dest ?? path.join(os.homedir(), 'pl-agent-scratch', 'course');
  const shortName: string = argv['short-name'] ?? 'AGENT';

  if (dest.startsWith(REPOSITORY_ROOT_PATH)) {
    throw new Error(
      `Refusing to create a scratch course inside the PrairieLearn repository (${dest}). ` +
        "Agent edits must not touch PrairieLearn's own working tree.",
    );
  }

  if (!(await fs.pathExists(dest))) {
    console.log(`Copying ${TEST_COURSE_PATH} -> ${dest}`);
    await fs.copy(TEST_COURSE_PATH, dest);

    // The seed course's UUIDs are already claimed by `testCourse` if it's been
    // synced, so give the copy fresh ones for the course and its instances.
    const infoPath = path.join(dest, 'infoCourse.json');
    const info = await fs.readJson(infoPath);
    info.uuid = crypto.randomUUID();
    info.name = shortName;
    info.title = 'Agent Scratch Course';
    await fs.writeJson(infoPath, info, { spaces: 4 });
  } else {
    console.log(`Reusing existing directory ${dest}`);
  }

  // Normally created by the server's `insertDevUser` on boot; this script may
  // run against a freshly migrated database where that hasn't happened yet.
  const user = await selectOrInsertUserByUid(argv['user-uid'] ?? 'dev@example.com');

  let course = await selectOptionalCourseByPath(dest);
  if (!course) {
    course = await insertCourse({
      institution_id: '1',
      short_name: shortName,
      title: 'Agent Scratch Course',
      display_timezone: 'America/Chicago',
      path: dest,
      repository: null,
      branch: 'master',
      authn_user_id: user.id,
    });

    console.log(`Inserted course id ${course.id}`);
  } else {
    console.log(`Course already exists with id ${course.id}`);
  }

  const logger = {
    error: (msg: string) => console.error(msg),
    warn: (msg: string) => console.warn(msg),
    info: (msg: string) => console.log(msg),
    verbose: () => {},
  };

  const result = await syncDiskToSql(course, logger);

  console.log(`\nSync status: ${result.status}`);

  console.log(
    '\nScratch course ready.\n' +
      `  id:       ${course.id}\n` +
      `  path:     ${course.path}\n` +
      `  database: ${config.postgresqlDatabase}\n\n` +
      'Start the MCP server with:\n' +
      `  tsx src/mcp-server.ts --course-id ${course.id}\n`,
  );
}

main()
  .then(() => shutdownPrairieLearn())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await shutdownPrairieLearn().catch(() => {});
    process.exit(1);
  });
