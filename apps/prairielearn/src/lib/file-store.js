// @ts-check
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
const debugfn = require('debug');

import * as sqldb from '@prairielearn/postgres';

import { config } from './config';
import { uploadToS3Async, getFromS3Async } from '../lib/aws';
import { IdSchema } from './db-types';

const debug = debugfn('prairielearn:' + path.basename(__filename, '.js'));
const sql = sqldb.loadSqlEquiv(__filename);

const StorageTypes = Object.freeze({
  S3: 'S3',
  FileSystem: 'FileSystem',
});

/**
 * Upload a file into the file store.
 *
 * @param {object} options - The options for the file upload.
 * @param {string} options.display_filename - The display_filename of the file.
 * @param {Buffer} options.contents - The file contents.
 * @param {string} options.type - The file type.
 * @param {string|null} options.assessment_id = The assessment for the file.
 * @param {string|null} options.assessment_instance_id - The assessment instance for the file.
 * @param {string|null} options.instance_question_id - The instance question for the file.
 * @param {string} options.user_id - The current user performing the update.
 * @param {string} options.authn_user_id - The current authenticated user.
 * @param {string} [options.storage_type] - AWS 'S3' or 'FileSystem' storage options.
 * @return {Promise<string>} The file_id of the newly created file.
 */
export async function uploadFile({
  display_filename,
  contents,
  type,
  assessment_id,
  assessment_instance_id,
  instance_question_id,
  user_id,
  authn_user_id,
  storage_type,
}) {
  storage_type = storage_type || config.fileStoreStorageTypeDefault;
  debug(`upload(): storage_type=${storage_type}`);

  let storage_filename;
  if (storage_type === StorageTypes.S3) {
    // use a UUIDv4 as the filename for S3
    storage_filename = uuidv4();
    if (config.fileStoreS3Bucket == null) {
      throw new Error('config.fileStoreS3Bucket is null, which does not allow uploads');
    }

    const res = await uploadToS3Async(
      config.fileStoreS3Bucket,
      storage_filename,
      null,
      false,
      contents,
    );
    debug('upload() : uploaded to ' + res.Location);
  } else if (storage_type === StorageTypes.FileSystem) {
    // Make a filename to store the file. We use a UUIDv4 as the filename,
    // and put it in two levels of directories corresponding to the first-3
    // and second-3 characters of the filename.
    const f = uuidv4();
    const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
    storage_filename = path.join(relDir, f.slice(6));
    const dir = path.join(config.filesRoot, relDir);
    const filename = path.join(config.filesRoot, storage_filename);

    debug('upload()');
    if (config.filesRoot == null) {
      throw new Error('config.filesRoot is null, which does not allow uploads');
    }

    debug(`upload() : mkdir ${dir}`);
    await fsPromises.mkdir(dir, { recursive: true, mode: 0o700 });
    debug(`upload(): writeFile ${filename}`);
    await fsPromises.writeFile(filename, contents, { mode: 0o600 });
  } else {
    throw new Error(`Unknown storage type: ${storage_type}`);
  }

  const file_id = await sqldb.queryRow(
    sql.insert_file,
    {
      display_filename,
      storage_filename,
      type,
      assessment_id,
      assessment_instance_id,
      instance_question_id,
      user_id,
      authn_user_id,
      storage_type,
    },
    IdSchema,
  );
  debug('upload(): inserted files row into DB');

  return file_id;
}

/**
 * Soft-delete a file from the file store, leaving the physical file on disk.
 *
 * @param {string} file_id - The file to delete.
 * @param {string} authn_user_id - The current authenticated user.
 */
export async function deleteFile(file_id, authn_user_id) {
  debug(`delete(): file_id=${file_id}`);
  debug(`delete(): authn_user_id=${authn_user_id}`);

  await sqldb.queryAsync(sql.delete_file, { file_id, authn_user_id });
  debug('delete(): soft-deleted row in DB');
}

/**
 * Option of returning a stream instead of a file
 *
 * @param {number | string} file_id - The file to get.
 * @return {Promise<(import('stream'))>} - Requested file stream.
 */
export async function getStream(file_id) {
  debug(`getStream(): file_id=${file_id}`);
  const file = await getFile(file_id, 'stream');
  return file.contents;
}

/**
 * Get a file from the file store.
 *
 * @param {number | string} file_id - The file to get.
 * @return {Promise<object>} An object with a buffer (of the file contents) and a file object.
 */
export async function getFile(file_id, data_type = 'buffer') {
  debug(`get(): file_id=${file_id}`);
  const params = { file_id };
  const result = await sqldb.queryZeroOrOneRowAsync(sql.select_file, params);
  debug('get(): got row from DB');

  let buffer, readStream;

  if (result.rows.length < 1) {
    throw new Error(`No file with file_id ${file_id}`);
  }

  if (result.rows[0].storage_type === StorageTypes.FileSystem) {
    if (config.filesRoot == null) {
      throw new Error(
        `config.filesRoot must be non-null to get file_id ${file_id} from file store`,
      );
    }

    const filename = path.join(config.filesRoot, result.rows[0].storage_filename);

    if (data_type === 'buffer') {
      debug(`get(): readFile ${filename} and return object with contents buffer and file object`);
      buffer = await fsPromises.readFile(filename);
    } else {
      debug(
        `get(): createReadStream ${filename} and return object with contents stream and file object`,
      );
      readStream = fs.createReadStream(filename);
    }
  }

  if (result.rows[0].storage_type === StorageTypes.S3) {
    if (config.fileStoreS3Bucket == null) {
      throw new Error(
        `config.fileStoreS3Bucket must be configured to get file_id ${file_id} from file store`,
      );
    }

    if (data_type === 'buffer') {
      debug(
        `get(): s3 fetch file ${result.rows[0].storage_filename} from ${config.fileStoreS3Bucket} and return object with contents buffer and file object`,
      );
      buffer = await getFromS3Async(config.fileStoreS3Bucket, result.rows[0].storage_filename);
    } else {
      debug(
        `get(): s3 fetch stream ${result.rows[0].storage_filename} from ${config.fileStoreS3Bucket} and return object with contents stream and file object`,
      );
      readStream = await getFromS3Async(
        config.fileStoreS3Bucket,
        result.rows[0].storage_filename,
        false,
      );
    }
  }

  return {
    contents: buffer || readStream,
    file: result.rows[0],
  };
}
