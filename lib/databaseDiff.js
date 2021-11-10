const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const colors = require('colors');
const _ = require('lodash');
const jsdiff = require('diff');

const describe = require('./databaseDescribe');

module.exports = {};

function diff(db1, db2, options, callback) {
  function formatText(text, formatter) {
    if (options.coloredOutput && formatter) {
      return formatter(text);
    }
    return text;
  }

  let db2Name = db2.type === 'database' ? db2.name : db2.path;

  let description1, description2;
  let result = '';

  async.series(
    [
      (callback) => {
        loadDescription(db1, (err, description) => {
          if (ERR(err, callback)) return;
          description1 = description;
          callback(null);
        });
      },
      (callback) => {
        loadDescription(db2, (err, description) => {
          if (ERR(err, callback)) return;
          description2 = description;
          callback(null);
        });
      },
      (callback) => {
        // Determine if both databases have the same tables
        let missingFrom1 = _.difference(_.keys(description2.tables), _.keys(description1.tables));
        let missingFrom2 = _.difference(_.keys(description1.tables), _.keys(description2.tables));
        let db2NameBold = formatText(db2Name, colors.bold);

        if (missingFrom1.length > 0) {
          result += formatText(`Tables added to ${db2NameBold} (${db2.type})\n`, colors.underline);
          result += formatText(
            missingFrom1.map((table) => `+ ${table}`).join('\n') + '\n\n',
            colors.green
          );
        }

        if (missingFrom2.length > 0) {
          result += formatText(
            `Tables missing from ${db2NameBold} (${db2.type})\n`,
            colors.underline
          );
          result += formatText(
            missingFrom2.map((table) => `- ${table}`).join('\n') + '\n\n',
            colors.red
          );
        }

        callback(null);
      },
      (callback) => {
        // Determine if both databases have the same enums
        let missingFrom1 = _.difference(_.keys(description2.enums), _.keys(description1.enums));
        let missingFrom2 = _.difference(_.keys(description1.enums), _.keys(description2.enums));

        let db2NameBold = formatText(db2Name, colors.bold);

        if (missingFrom1.length > 0) {
          result += formatText(`Enums added to ${db2NameBold} (${db1.type})\n`, colors.underline);
          result += formatText(
            missingFrom1.map((enumName) => `+ ${enumName}`).join('\n') + '\n\n',
            colors.green
          );
        }

        if (missingFrom2.length > 0) {
          result += formatText(
            `Enums missing from ${db2NameBold} (${db2.type})\n`,
            colors.underline
          );
          result += formatText(
            missingFrom2.map((enumName) => `- ${enumName}`).join('\n') + '\n\n',
            colors.red
          );
        }

        callback(null);
      },
      (callback) => {
        // Determine if the columns of any table differ
        let intersection = _.intersection(_.keys(description1.tables), _.keys(description2.tables));
        _.forEach(intersection, (table) => {
          // We normalize each blob to end with a newline to make diffs print cleaner
          const diff = jsdiff.diffLines(
            description1.tables[table].trim() + '\n',
            description2.tables[table].trim() + '\n'
          );
          if (diff.length === 1) return;

          const boldTable = formatText(table, colors.bold);
          result += formatText(`Differences in ${boldTable} table\n`, colors.underline);

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
            result += formatText(
              change,
              part.added ? colors.green : part.removed ? colors.red : null
            );
          });
          result += '\n\n';
        });
        callback(null);
      },
      (callback) => {
        // Determine if the values of any enums differ
        let intersection = _.intersection(_.keys(description1.enums), _.keys(description2.enums));
        _.forEach(intersection, (enumName) => {
          // We don't need to do a particularly fancy diff here, since
          // enums are just represented here as strings
          if (description1.enums[enumName].trim() !== description2.enums[enumName].trim()) {
            const boldEnum = formatText(enumName, colors.bold);
            result += formatText(`Differences in ${boldEnum} enum\n`);
            result += formatText(`- ${description1.enums[enumName].trim()}\n`, colors.red);
            result += formatText(`+ ${description2.enums[enumName].trim()}\n`, colors.green);
            result += '\n\n';
          }
        });
        callback(null);
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, result);
    }
  );
}

function loadDescriptionFromDisk(dirPath, callback) {
  const description = {
    tables: {},
    enums: {},
  };

  async.waterfall(
    [
      (callback) => {
        fs.readdir(path.join(dirPath, 'tables'), (err, entries) => {
          if (ERR(err, callback)) return;
          callback(null, entries);
        });
      },
      (entries, callback) => {
        async.each(
          entries,
          (entry, callback) => {
            fs.readFile(path.join(dirPath, 'tables', entry), 'utf8', (err, data) => {
              if (ERR(err, callback)) return;
              description.tables[entry.replace('.pg', '')] = data;
              callback(null);
            });
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
      (callback) => {
        fs.readdir(path.join(dirPath, 'enums'), (err, entries) => {
          if (err) {
            if (err.code === 'ENOENT') {
              return callback(null);
            } else {
              return ERR(err, callback);
            }
          }
          callback(null, entries);
        });
      },
      (entries, callback) => {
        async.each(
          entries,
          (entry, callback) => {
            fs.readFile(path.join(dirPath, 'enums', entry), 'utf8', (err, data) => {
              if (ERR(err, callback)) return;
              description.enums[entry.replace('.pg', '')] = data;
              callback(null);
            });
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, description);
    }
  );
}

function loadDescriptionFromDatabase(name, callback) {
  const options = {
    databaseName: name,
    outputFormat: 'string',
    coloredOutput: false,
  };

  return describe.describe(options, callback);
}

function loadDescription(db, callback) {
  if (db.type === 'database') {
    return loadDescriptionFromDatabase(db.name, callback);
  } else if (db.type === 'directory') {
    return loadDescriptionFromDisk(db.path, callback);
  } else {
    return callback(new Error('Invalid database type'));
  }
}

module.exports.diffDatabases = function (datbase1, database2, options, callback) {
  const db1 = {
    type: 'database',
    name: datbase1,
  };

  const db2 = {
    type: 'database',
    name: database2,
  };

  diff(db1, db2, options, callback);
};

module.exports.diffDatabaseAndDirectory = function (database, directory, options, callback) {
  const db1 = {
    type: 'database',
    name: database,
  };

  const db2 = {
    type: 'directory',
    path: directory,
  };

  diff(db1, db2, options, callback);
};

module.exports.diffDirectoryAndDatabase = function (directory, database, options, callback) {
  const db1 = {
    type: 'directory',
    path: directory,
  };

  const db2 = {
    type: 'database',
    name: database,
  };

  diff(db1, db2, options, callback);
};

module.exports.diffDirectories = function (directory1, directory2, options, callback) {
  const db1 = {
    type: 'directory',
    path: directory1,
  };

  const db2 = {
    type: 'directory',
    path: directory2,
  };

  diff(db1, db2, options, callback);
};
