#!/usr/bin/env node

import path from 'path';

import async from 'async';
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'fs-extra';

import {
  type DatabaseDescription,
  describeDatabase,
  formatDatabaseDescription,
} from '../describe.js';

const program = new Command();
program
  .name('pg-describe')
  .usage('<database name> [options]')
  .argument('<database>', 'Database name to describe')
  .option('-o, --output <dir>', 'Specify a directory to output files to')
  .option('--ignore-tables <tables...>', 'A list of tables to ignore')
  .option('--ignore-enums <enums...>', 'A list of enums to ignore')
  .option(
    '--ignore-columns <columns...>',
    'A list of columns to ignore, formatted like [table].[column]',
  )
  .showHelpAfterError();

program.parse(process.argv);
const opts = program.opts();
const dbName = program.args[0];

if (!dbName) {
  program.help({ error: true });
}

// Disable color if we're not attached to a tty
const coloredOutput = !opts.output && process.stdout.isTTY;

function formatText(text: string, formatter: (text: string) => string) {
  if (!opts.output && coloredOutput) {
    return formatter(text);
  }
  return text;
}

function printDescription(description: DatabaseDescription) {
  const formattedDescription = formatDatabaseDescription(description, { coloredOutput });
  for (const tableName of Object.keys(formattedDescription.tables).sort()) {
    process.stdout.write(formatText(`[table] ${tableName}\n`, chalk.bold));
    process.stdout.write(formattedDescription.tables[tableName]);
    process.stdout.write('\n\n');
  }

  for (const enumName of Object.keys(formattedDescription.enums).sort()) {
    process.stdout.write(formatText(`[enum] ${enumName}\n`, chalk.bold));
    process.stdout.write(formattedDescription.enums[enumName]);
    process.stdout.write('\n\n');
  }
}

async function writeDescriptionToDisk(description: DatabaseDescription, dir: string) {
  const formattedDescription = formatDatabaseDescription(description, { coloredOutput: false });
  await fs.ensureDir(path.join(dir, 'tables'));
  await fs.ensureDir(path.join(dir, 'enums'));
  await fs.emptyDir(path.join(dir, 'tables'));
  await fs.emptyDir(path.join(dir, 'enums'));
  await async.eachOf(formattedDescription.tables, async (value, key) => {
    await fs.writeFile(path.join(dir, 'tables', `${key}.pg`), value);
  });
  await async.eachOf(formattedDescription.enums, async (value, key) => {
    await fs.writeFile(path.join(dir, 'enums', `${key}.pg`), value);
  });
}

function parseListOption(option: string[]): string[] {
  return option.flatMap((item: string) => item.split(',').map((part) => part.trim()));
}

const options = {
  ignoreTables: parseListOption(opts.ignoreTables ?? []),
  ignoreEnums: parseListOption(opts.ignoreEnums ?? []),
  ignoreColumns: parseListOption(opts.ignoreColumns ?? []),
};

const description = await describeDatabase(dbName, options);
if (opts.output) {
  await writeDescriptionToDisk(description, opts.output);
} else {
  printDescription(description);
}
process.exit(0);
