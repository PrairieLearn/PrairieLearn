const fsPromises = require('fs').promises;
const util = require('util');
const path = require('path');
const async = require('async');
const _ = require('lodash');

const sqldb = require('@prairielearn/prairielib/sql-db');
const schemas = require('../schemas');
const jsonLoad = require('../lib/json-load');
const namedLocks = require('../lib/named-locks');

async function loadAnnouncements() {
    const announcements = [];
    dirs = await fsPromises.readdir(__dirname);
    await async.each(dirs, async (dir) => {
        const infoFilename = path.join(__dirname, dir, 'info.json');
        let info;
        try {
            info = await jsonLoad.readInfoJSONAsync(infoFilename, schemas.infoAnnouncement);
        } catch (err) {
            if (err.code == 'ENOTDIR' || err.code == 'ENOENT') return; // skip dir entries without an info.json
            throw err;
        }
        info.directory = dir;
        announcements.push(info);
    });

    // Check for duplicate UUIDs
    _(announcements)
        .groupBy('uuid')
        .each(function(aList, uuid) {
            if (aList.length > 1) {
                const directories = aList.map(a => a.directory).join(', ');
                throw new Error(`UUID ${uuid} is used in multiple announcements: ${directories}`);
            }
        });

    return announcements;
}

module.exports.initAsync = async function() {
    const lockName = 'announcements';
    lock = await namedLocks.waitLockAsync(lockName, {});
    try {
        const announcements = await loadAnnouncements();
        await sqldb.callAsync('sync_announcements', [JSON.stringify(announcements)]);
    } catch (err) {
        namedLocks.releaseLock(lock);
        throw err;
    }
};
module.exports.init = util.callbackify(module.exports.initAsync);
