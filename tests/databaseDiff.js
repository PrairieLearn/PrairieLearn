const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const pg = require('pg');
const pgArray = require('pg').types.arrayParser;
const assert = require('chai').assert;
const colors = require('colors');
const _ = require('lodash');
const jsdiff = require('diff');

const sqldb = require('../lib/sqldb');
const sqlLoader = require('../lib/sql-loader');
const describe = require('../tests/databaseDescribe');

module.exports = {};

function diff(db1, db2, options, callback) {
    function formatText(text, formatter) {
        if (options.coloredOutput && formatter) {
            return formatter(text);
        }
        return text;
    }

    let db1Name = db1.type === 'database' ? db1.name : db1.path;
    let db2Name = db2.type === 'database' ? db2.name : db2.path;

    let description1, description2;
    let result = '';

    async.series([
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
            // Remove ignored tables and enums
            description1.tables = _.pickBy(description1.tables, (value, key) => options.ignoreTables.indexOf(key) == -1);
            description2.tables = _.pickBy(description2.tables, (value, key) => options.ignoreTables.indexOf(key) == -1);
            description1.tables = _.pickBy(description1.tables, (value, key) => options.ignoreEnums.indexOf(key) == -1);
            description2.tables = _.pickBy(description2.tables, (value, key) => options.ignoreEnums.indexOf(key) == -1);
            callback(null);
        },
        (callback) => {
            // Determine if both databases have the same tables
            let missingFrom1 = _.difference(_.keys(description2.tables), _.keys(description1.tables));
            let missingFrom2 = _.difference(_.keys(description1.tables), _.keys(description2.tables));

            if (missingFrom1.length > 0) {
                let db1NameBold = formatText(db1Name, colors.bold);
                result += formatText(`Tables missing from ${db1NameBold} (${db1.type})\n`, colors.underline);
                result += missingFrom1.map(table => `    ${table}`).join('\n') + '\n\n';
            }

            if (missingFrom2.length > 0) {
                let db2NameBold = formatText(db2Name, colors.bold);
                result += formatText(`Tables missing from ${db2NameBold} (${db2.type})\n`, colors.underline);
                result += missingFrom2.map(table => `    ${table}`).join('\n') + '\n\n';
            }

            callback(null);
        },
        (callback) => {
            // Determine if both databases have the same enums
            let missingFrom1 = _.difference(_.keys(description2.enums), _.keys(description1.enums));
            let missingFrom2 = _.difference(_.keys(description1.enums), _.keys(description2.enums));

            if (missingFrom1.length > 0) {
                let db1NameBold = formatText(db1Name, colors.bold);
                result += formatText(`Enums missing from ${db1NameBold} (${db1.type})\n`, colors.underline);
                result += missingFrom1.map(enumName => `    ${enumName}`).join('\n') + '\n\n';
            }

            if (missingFrom2.length > 0) {
                let db2NameBold = formatText(db2Name, colors.bold);
                result += formatText(`Enums missing from ${db2NameBold} (${db2.type})\n`, colors.underline);
                result += missingFrom2.map(enumName => `    ${enumName}`).join('\n') + '\n\n';
            }

            callback(null);
        },
        (callback) => {
            // Determine if the columns of any table differ
            let intersection = _.intersection(_.keys(description1.tables), _.keys(description2.tables));
            _.forEach(intersection, (table) => {
                // We normalize each blob to end with a newline to make diffs print cleaner
                const diff = jsdiff.diffLines(description1.tables[table].trim() + '\n', description2.tables[table].trim() + '\n');
                if (diff.length == 1) return;

                const boldTable = formatText(table, colors.bold);
                result += formatText(`Differences in ${boldTable} table\n`, colors.underline);
                _.forEach(diff, (part) => {
                    result += formatText(part.value, part.added ? colors.green : part.removed ? colors.red : null);
                });
                result += '\n\n';
            });
            callback(null);
        },
        (callback) => {
            // Determine if the values of any enums differ
            let intersection = _.intersection(_.keys(description1.enums), _.keys(description2.enums));
            _.forEach(intersection, (enumName) => {
                const diff = jsdiff.diffWords(description1.enums[enumName].trim(), description2.enums[enumName].trim());
                if (diff.length == 1) return;

                const boldEnum = formatText(enumName, colors.bold);
                result += formatText(`Differences in ${boldEnum} enum\n`);
                _.forEach(diff, (part) => {
                    result += formatText(part.value, part.added ? colors.green : part.removed ? colors.red : null);
                });
                result += '\n\n';
            });
            callback(null);
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, result);
    });
}

function loadDescriptionFromDisk(dirPath, callback) {
    const description = {
        tables: {},
        enums: {}
    };

    async.waterfall([
        (callback) => {
            fs.readdir(path.join(dirPath, 'tables'), (err, entries) => {
                if (ERR(err, callback)) return;
                callback(null, entries);
            });
        },
        (entries, callback) => {
            async.each(entries, (entry, callback) => {
                fs.readFile(path.join(dirPath, 'tables', entry), 'utf8', (err, data) => {
                    if (ERR(err, callback)) return;
                    description.tables[entry.replace('.pg', '')] = data;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.readdir(path.join(dirPath, 'enums'), (err, entries) => {
                if (err) {
                    if (err.code == 'ENOENT') {
                        return callback(null);
                    } else {
                        return ERR(err, callback);
                    }
                }
                callback(null, entries);
            });
        },
        (entries, callback) => {
            async.each(entries, (entry, callback) => {
                fs.readFile(path.join(dirPath, 'enums', entry), 'utf8', (err, data) => {
                    if (ERR(err, callback)) return;
                    description.enums[entry.replace('.pg', '')] = data;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null, description);
    })
}

function loadDescriptionFromDatabase(name, callback) {
    const options = {
        databaseName: name,
        outputFormat: 'string',
        coloredOutput: false
    };

    return describe.describe(options, callback);
}

function loadDescription(db, callback) {
    if (db.type === 'database') {
        return loadDescriptionFromDatabase(db.name, callback);
    } else if (db.type == 'directory') {
        return loadDescriptionFromDisk(db.path, callback);
    } else {
        return callback(new Error('Invalid database type'));
    }
}

module.exports.diffDatabases = function(datbase1, database2, options, callback) {
    const db1 = {
        type: 'database',
        name: datbase1
    };

    const db2 = {
        type: 'database',
        name: database2
    };

    diff(db1, db2, options, callback);
};

module.exports.diffDatabaseAndDirectory = function(database, directory, options, callback) {
    const db1 = {
        type: 'database',
        name: database
    };

    const db2 = {
        type: 'directory',
        path: directory
    };

    diff(db1, db2, options, callback);
};

module.exports.diffDirectoryAndDatabase = function(directory, database, options, callback) {
    const db1 = {
        type: 'directory',
        path: directory
    };

    const db2 = {
        type: 'database',
        name: database
    };

    diff(db1, db2, options, callback);
};

module.exports.diffDirectories = function(directory1, directory2, options, callback) {
    const db1 = {
        type: 'directory',
        path: directory1
    };

    const db2 = {
        type: 'directory',
        path: directory2
    };

    diff(db1, db2, options, callback);
}
