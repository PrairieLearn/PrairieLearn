// usage:
// $ node dump-anonymize.mjs <data-dump-folder> <anonymous-output-folder>

import fs from 'node:fs';
import async from 'async';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';

const infolder = process.argv[2];
const outfolder = process.argv[3];

function getUUID(map, key) {
  if (!map[key]) {
    map[key] = uuidv4();
  }
  return map[key];
}

const newUserIds = {};
const newUserUids = {};
const newUserNames = {};

function anonymizeJSON(contents) {
  for (let instance of contents) {
    if (instance['user_id']) {
      instance.user_id = getUUID(newUserIds, instance.user_id);
    }

    if (instance['user_uid']) {
      instance.user_uid = getUUID(newUserUids, instance.user_uid);
    }

    if (instance['user_name']) {
      instance.user_name = getUUID(newUserNames, instance.user_name);
    }

    if (instance['auth_user_uid']) {
      instance.auth_user_uid = getUUID(newUserUids, instance.auth_user_uid);
    }

    if (instance['uids']) {
      let newUids = [];
      for (let uid of instance.uids) {
        newUids.push(getUUID(newUserUids, uid));
      }
      instance.uids = newUids;
    }
  }
  return contents;
}

function anonymizeFile(filename, contents) {
  if (filename.endsWith('_instances.json')) {
    return anonymizeJSON(contents);
  } else if (filename.endsWith('_instance_questions.json')) {
    return anonymizeJSON(contents);
  } else if (filename.endsWith('_access_rules.json')) {
    return anonymizeJSON(contents);
  } else if (filename.endsWith('_submissions.json')) {
    return anonymizeJSON(contents);
  } else if (filename.endsWith('_log.json')) {
    return anonymizeJSON(contents);
  } else if (filename === 'assessments.json') {
    return anonymizeJSON(contents);
  } else if (filename === 'gradebook.json') {
    return anonymizeJSON(contents);
  } else if (filename === 'download_log.txt') {
    return contents;
  } else {
    console.error('Unrecognized File Type: ', filename);
  }
}

function processFile(filename, callback) {
  const fullpath = path.join(infolder, filename);
  const outpath = path.join(outfolder, filename);

  fs.readFile(fullpath, (err, data) => {
    if (err) {
      console.error(err);
    }
    let outstring;
    if (filename.endsWith('.json')) {
      data = JSON.parse(data);
      const anonymizedContents = anonymizeFile(filename, data);
      outstring = JSON.stringify(anonymizedContents, null, 2);
    } else {
      outstring = anonymizeFile(filename, data);
    }

    fs.writeFile(outpath, outstring, (err) => {
      if (err) {
        console.error(err);
      }
      callback();
    });
  });
}

const files = fs.readdirSync(infolder);

if (!fs.existsSync(outfolder)) {
  fs.mkdirSync(outfolder);
}

async.mapLimit(files, 12, processFile);
