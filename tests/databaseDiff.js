const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const pg = require('pg');
const pgArray = require('pg').types.arrayParser;
const assert = require('chai').assert;
const colors = require('colors');

const sqldb = require('../lib/sqldb');
const sqlLoader = require('../lib/sql-loader');
const describe = require('../tests/databaseDescribe');

module.exports = {};

function diff(db1, db2, callback) {
    loadDescription(db1, callback);
    loadDescription(db2, callback);
}

function loadDescriptionFromDisk(dirPath, callback) {
    const description = {
        tables: {},
        enums: {}
    };

    async.waterfall([
        (callback) => {
            fs.readdir(path.join(dirPath, 'tables'), (err, entries) => {
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

module.exports.diffDatabases = function(datbase1, database2, callback) {
    const db1 = {
        type: 'database',
        name: datbase1
    };

    const db2 = {
        type: 'database',
        name: database2
    };

    diff(db1, db2, callback);
};

module.exports.diffDatabaseAndDirectory = function(database, directory, callback) {
    const db1 = {
        type: 'database',
        name: database
    };

    const db2 = {
        type: 'directory',
        path: directory
    };

    diff(db1, db2, callback);
};

module.exports.diffDirectories = function(directory1, directory2, callback) {
    const db1 = {
        type: 'directory',
        path: directory1
    };

    const db2 = {
        type: 'directory',
        path: directory1
    };

    diff(db1, db2, callback);
}
