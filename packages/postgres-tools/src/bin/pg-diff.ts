#!/usr/bin/env node

import yargs from 'yargs';

import {
  diffDatabaseAndDirectory,
  diffDatabases,
  diffDirectories,
  diffDirectoryAndDatabase,
} from '../diff.js';

const args = yargs(process.argv.slice(2))
  .usage('Usage: $0 [options]')
  .option('db', {
    description: 'reads a description from the named database',
  })
  .option('dir', {
    description: "reads a description from a directory that's been generated by pg-describe",
  })
  .help('h')
  .alias('h', 'help')
  .example(
    '$0 --db postgres --dir db_dump',
    'Diffs the database "postgres" with the description in the directory "db_dump"',
  )
  .example(
    '$0 --db postgres --db old_restore',
    'Diffs the database "postgres" with the database "old_restore"',
  )
  .strict();

const argv = args.parseSync();

const options = {
  outputFormat: 'string',
  coloredOutput: process.stdout.isTTY,
};

if (argv.db && typeof argv.db === 'string' && argv.dir && typeof argv.dir === 'string') {
  // Ensure correct ordering for the sake of diffs
  if (process.argv.indexOf('--db') < process.argv.indexOf('--dir')) {
    diffDatabaseAndDirectory(argv.db, argv.dir, options).then(handleResults, handleError);
  } else {
    diffDirectoryAndDatabase(argv.dir, argv.db, options).then(handleResults, handleError);
  }
} else if (argv.db && Array.isArray(argv.db) && argv.db.length === 2 && !argv.dir) {
  diffDatabases(argv.db[0], argv.db[1], options).then(handleResults, handleError);
} else if (argv.dir && Array.isArray(argv.dir) && argv.dir.length === 2 && !argv.db) {
  diffDirectories(argv.dir[0], argv.dir[1], options).then(handleResults, handleError);
} else {
  args.showHelp();
  process.exit(1);
}

function handleResults(results: string) {
  process.stdout.write(results);
  process.exit(0);
}

function handleError(err: any) {
  console.error(err);
  process.exit(1);
}
