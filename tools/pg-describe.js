#!/usr/bin/env node
// @ts-check

const async = require('async');
const chalk = require('chalk');
const fs = require('fs-extra');
const _ = require('lodash');
const path = require('path');

const databaseDescribe = require('../lib/databaseDescribe');

const yargs = require('yargs')
  .usage('Usage: $0 <database name> [options]')
  .demandCommand(1)
  .option('output', {
    alias: 'o',
    nargs: 1,
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
    'Describe the "userdb" database; ignore specific tables and columns'
  )
  .strict();

const argv = yargs.parseSync();

if (argv._.length !== 1) {
  yargs.showHelp();
  process.exit(1);
}

// Disable color if we're not attached to a tty
const coloredOutput = !argv.output && process.stdout.isTTY;

const options = {
  ignoreTables: (argv['ignore-tables'] ?? []).map((table) => table.toString()),
  ignoreEnums: (argv['ignore-enums'] ?? []).map((enumName) => enumName.toString()),
  ignoreColumns: (argv['ignore-columns'] ?? []).map((column) => column.toString()),
};

function formatText(text, formatter) {
  if (!argv.o && coloredOutput) {
    return formatter(text);
  }
  return text;
}

databaseDescribe.describe(argv._[0].toString(), options).then(
  async (description) => {
    if (argv.o) {
      await writeDescriptionToDisk(description, argv.o);
    } else {
      printDescription(description);
    }
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

function printDescription(description) {
  _.forEach(_.sortBy(_.keys(description.tables)), (tableName) => {
    process.stdout.write(formatText(`[table] ${tableName}\n`, chalk.bold));
    process.stdout.write(description.tables[tableName]);
    process.stdout.write('\n\n');
  });

  _.forEach(_.sortBy(_.keys(description.enums)), (enumName) => {
    process.stdout.write(formatText(`[enum] ${enumName}\n`, chalk.bold));
    process.stdout.write(description.enums[enumName]);
    process.stdout.write('\n\n');
  });
}

async function writeDescriptionToDisk(description, dir, coloredOutput) {
  const formattedDescription = databaseDescribe.formatDescription(description, { coloredOutput });
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
