const fsPromises = require('fs').promises;
const util = require('util');
const path = require('path');
const async = require('async');
const _ = require('lodash');

const sqldb = require('@prairielearn/postgres');
const schemas = require('../schemas');
const jsonLoad = require('../lib/json-load');
const namedLocks = require('@prairielearn/named-locks');

async function loadNewsItems() {
  const news_items = [];
  const regex = /^([0-9]+)_.+$/;
  const dirs = await fsPromises.readdir(__dirname);
  await async.each(dirs, async (dir) => {
    const infoFilename = path.join(__dirname, dir, 'info.json');
    let info;
    try {
      info = await jsonLoad.readInfoJSONAsync(infoFilename, schemas.infoNewsItem);
    } catch (err) {
      if (err.code === 'ENOTDIR' || err.code === 'ENOENT') return; // skip dir entries without an info.json
      throw err;
    }
    info.directory = dir;
    info.index = regex.exec(dir)[1];
    news_items.push(info);
  });

  // Check for duplicate UUIDs
  _(news_items)
    .groupBy('uuid')
    .each(function (aList, uuid) {
      if (aList.length > 1) {
        const directories = aList.map((a) => a.directory).join(', ');
        throw new Error(`UUID ${uuid} is used in multiple news items: ${directories}`);
      }
    });

  // Check for duplicate UUIDs
  _(news_items)
    .groupBy('index')
    .each(function (aList, index) {
      if (aList.length > 1) {
        const directories = aList.map((a) => a.directory).join(', ');
        throw new Error(`News item index ${index} is used in multiple news items: ${directories}`);
      }
    });

  return _.sortBy(news_items, 'directory');
}

module.exports.initAsync = async function (notify_with_new_server) {
  const lockName = 'news_items';
  const lock = await namedLocks.waitLockAsync(lockName, {});
  try {
    const news_items = await loadNewsItems();
    await sqldb.callAsync('sync_news_items', [JSON.stringify(news_items), notify_with_new_server]);
  } catch (err) {
    await namedLocks.releaseLockAsync(lock);
    throw err;
  }
  await namedLocks.releaseLockAsync(lock);
};
module.exports.init = util.callbackify(module.exports.initAsync);
