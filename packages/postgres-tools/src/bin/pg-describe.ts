#!/usr/bin/env node

import async from 'async';
import chalk from 'chalk';
import fs from 'fs-extra';
import _ from 'lodash';
import path from 'path';
import yargs from 'yargs';

import { describeDatabase, formatDatabaseDescription, DatabaseDescription } from '../describe';

const args = yargs
  .usage('Usage: $0 <database name> [options]')
  .demandCommand(1)
  .option('output', {
    alias: 'o',
    nargs: 1,
    string: true,
    description: 'Specify a directory to output files to',
  })
  .option('ignore-tables', {
    array: true,
    description: 'a list of tables to ignore',
  })
  .option('ignore-enums', {
    array: true,
    description: 'a list of enums to ignore',
  })
  .option('ignore-columns', {
    array: true,
    description: 'a list of columns to ignore, formatted like [table].[column]',
  })
  .help('h')
  .alias('h', 'help')
  .example('$0 postgres', 'Describe the "postgres" database')
  .example(
    '$0 userdb -o db_description --ignore-tables a b --ignore-columns a.col1 a.col2',
    'Describe the "userdb" database; ignore specific tables and columns',
  )
  .strict();

const argv = args.parseSync();

if (argv._.length !== 1) {
  args.showHelp();
  process.exit(1);
}

// Disable color if we're not attached to a tty
const coloredOutput = !argv.output && process.stdout.isTTY;

const options = {
  ignoreTables: (argv['ignore-tables'] ?? []).map((table) => table.toString()),
  ignoreEnums: (argv['ignore-enums'] ?? []).map((enumName) => enumName.toString()),
  ignoreColumns: (argv['ignore-columns'] ?? []).map((column) => column.toString()),
};

function formatText(text: string, formatter: (text: string) => string) {
  if (!argv.output && coloredOutput) {
    return formatter(text);
  }
  return text;
}

describeDatabase(argv._[0].toString(), options).then(
  async (description) => {
    if (argv.output) {
      await writeDescriptionToDisk(description, argv.output);
    } else {
      printDescription(description);
    }
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

function printDescription(description: DatabaseDescription) {
  const formattedDescription = formatDatabaseDescription(description, { coloredOutput });
  _.forEach(_.sortBy(_.keys(formattedDescription.tables)), (tableName) => {
    process.stdout.write(formatText(`[table] ${tableName}\n`, chalk.bold));
    process.stdout.write(formattedDescription.tables[tableName]);
    process.stdout.write('\n\n');
  });

  _.forEach(_.sortBy(_.keys(formattedDescription.enums)), (enumName) => {
    process.stdout.write(formatText(`[enum] ${enumName}\n`, chalk.bold));
    process.stdout.write(formattedDescription.enums[enumName]);
    process.stdout.write('\n\n');
  });
}

async function writeDescriptionToDisk(description: DatabaseDescription, dir: string) {
  const formattedDescription = formatDatabaseDescription(description, { coloredOutput: false });
  await fs.emptyDir(dir);
  await fs.mkdir(path.join(dir, 'tables'));
  await fs.mkdir(path.join(dir, 'enums'));
  await async.eachOf(formattedDescription.tables, async (value, key) => {
    await fs.writeFile(path.join(dir, 'tables', `${key}.pg`), value);
  });
  await async.eachOf(formattedDescription.enums, async (value, key) => {
    await fs.writeFile(path.join(dir, 'enums', `${key}.pg`), value);
  });
}
