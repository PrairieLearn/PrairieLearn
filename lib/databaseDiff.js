// @ts-check
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const _ = require('lodash');
const jsdiff = require('diff');

const describe = require('./databaseDescribe');

/** @typedef {{ type: 'database', name: string }} DatabaseInfo */
/** @typedef {{ type: 'directory', path: string }} DirectoryInfo */
/** @typedef {DatabaseInfo | DirectoryInfo} DiffTarget */
/** @typedef {{ coloredOutput?: boolean}} DiffOptions */

/**
 *
 * @param {DiffTarget} db1
 * @param {DiffTarget} db2
 * @param {DiffOptions} options
 * @returns {Promise<string>}
 */
async function diff(db1, db2, options) {
  function formatText(text, formatter) {
    if (options.coloredOutput && formatter) {
      return formatter(text);
    }
    return text;
  }

  let db2Name = db2.type === 'database' ? db2.name : db2.path;
  let db2NameBold = formatText(db2Name, chalk.bold);

  let result = '';

  const description1 = await loadDescription(db1);
  const description2 = await loadDescription(db2);

  // Determine if both databases have the same tables
  let tablesMissingFrom1 = _.difference(_.keys(description2.tables), _.keys(description1.tables));
  let tablesMissingFrom2 = _.difference(_.keys(description1.tables), _.keys(description2.tables));

  if (tablesMissingFrom1.length > 0) {
    result += formatText(`Tables added to ${db2NameBold} (${db2.type})\n`, chalk.underline);
    result += formatText(
      tablesMissingFrom1.map((table) => `+ ${table}`).join('\n') + '\n\n',
      chalk.green
    );
  }

  if (tablesMissingFrom2.length > 0) {
    result += formatText(`Tables missing from ${db2NameBold} (${db2.type})\n`, chalk.underline);
    result += formatText(
      tablesMissingFrom2.map((table) => `- ${table}`).join('\n') + '\n\n',
      chalk.red
    );
  }

  // Determine if both databases have the same enums
  let enumsMissingFrom1 = _.difference(_.keys(description2.enums), _.keys(description1.enums));
  let enumsMissingFrom2 = _.difference(_.keys(description1.enums), _.keys(description2.enums));

  if (enumsMissingFrom1.length > 0) {
    result += formatText(`Enums added to ${db2NameBold} (${db1.type})\n`, chalk.underline);
    result += formatText(
      enumsMissingFrom1.map((enumName) => `+ ${enumName}`).join('\n') + '\n\n',
      chalk.green
    );
  }

  if (enumsMissingFrom2.length > 0) {
    result += formatText(`Enums missing from ${db2NameBold} (${db2.type})\n`, chalk.underline);
    result += formatText(
      enumsMissingFrom2.map((enumName) => `- ${enumName}`).join('\n') + '\n\n',
      chalk.red
    );
  }

  // Determine if the columns of any table differ
  let intersection = _.intersection(_.keys(description1.tables), _.keys(description2.tables));
  _.forEach(intersection, (table) => {
    // We normalize each blob to end with a newline to make diffs print cleaner
    const diff = jsdiff.diffLines(
      description1.tables[table].trim() + '\n',
      description2.tables[table].trim() + '\n'
    );
    if (diff.length === 1) return;

    const boldTable = formatText(table, chalk.bold);
    result += formatText(`Differences in ${boldTable} table\n`, chalk.underline);

    // Shift around the newlines so that we can cleanly show +/- symbols
    for (let i = 1; i < diff.length; i++) {
      let prev = diff[i - 1].value;
      if (prev[prev.length - 1] === '\n') {
        diff[i - 1].value = prev.slice(0, -1);
        diff[i].value = '\n' + diff[i].value;
      }
    }

    _.forEach(diff, (part, index) => {
      if (index === 0) {
        part.value = '\n' + part.value;
      }
      const mark = part.added ? '+ ' : part.removed ? '- ' : '  ';
      let change = part.value.split('\n').join(`\n${mark}`);
      if (index === 0) {
        change = change.slice(1, change.length);
      }
      result += formatText(change, part.added ? chalk.green : part.removed ? chalk.red : null);
    });
    result += '\n\n';
  });

  // Determine if the values of any enums differ
  let enumsIntersection = _.intersection(_.keys(description1.enums), _.keys(description2.enums));
  _.forEach(enumsIntersection, (enumName) => {
    // We don't need to do a particularly fancy diff here, since
    // enums are just represented here as strings
    if (description1.enums[enumName].trim() !== description2.enums[enumName].trim()) {
      const boldEnum = formatText(enumName, chalk.bold);
      result += formatText(`Differences in ${boldEnum} enum\n`);
      result += formatText(`- ${description1.enums[enumName].trim()}\n`, chalk.red);
      result += formatText(`+ ${description2.enums[enumName].trim()}\n`, chalk.green);
      result += '\n\n';
    }
  });

  return result;
}

async function loadDescriptionFromDisk(dirPath) {
  const description = {
    tables: {},
    enums: {},
  };

  const tables = await fs.readdir(path.join(dirPath, 'tables'));
  await async.each(tables, async (table) => {
    const data = await fs.readFile(path.join(dirPath, 'tables', table), 'utf8');
    description.tables[table.replace('.pg', '')] = data;
  });

  const enums = await fs.readdir(path.join(dirPath, 'enums'));
  await async.each(enums, async (enumName) => {
    const data = await fs.readFile(path.join(dirPath, 'enums', enumName), 'utf8');
    description.enums[enumName.replace('.pg', '')] = data;
  });

  return description;
}

async function loadDescriptionFromDatabase(name) {
  const description = await describe.describe(name);
  return describe.formatDescription(description, { coloredOutput: false });
}

async function loadDescription(db) {
  if (db.type === 'database') {
    return loadDescriptionFromDatabase(db.name);
  } else if (db.type === 'directory') {
    return loadDescriptionFromDisk(db.path);
  } else {
    throw new Error('Invalid database type');
  }
}

module.exports.diffDatabases = async function (database1, database2, options) {
  return diff(
    {
      type: 'database',
      name: database1,
    },
    {
      type: 'database',
      name: database2,
    },
    options
  );
};

module.exports.diffDatabaseAndDirectory = async function (database, directory, options) {
  return diff(
    {
      type: 'database',
      name: database,
    },
    {
      type: 'directory',
      path: directory,
    },
    options
  );
};

module.exports.diffDirectoryAndDatabase = async function (directory, database, options) {
  return diff(
    {
      type: 'directory',
      path: directory,
    },
    {
      type: 'database',
      name: database,
    },
    options
  );
};

module.exports.diffDirectories = async function (directory1, directory2, options) {
  return diff(
    {
      type: 'directory',
      path: directory1,
    },
    {
      type: 'directory',
      path: directory2,
    },
    options
  );
};
