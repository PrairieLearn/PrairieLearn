import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { type Stream } from 'stream';

import debugfn from 'debug';
import { v4 as uuidv4 } from 'uuid';

import * as sqldb from '@prairielearn/postgres';

import { getFromS3, uploadToS3 } from './aws.js';
import { config } from './config.js';
import { type File, FileSchema, IdSchema } from './db-types.js';

const debug = debugfn('prairielearn:socket-server');
const sql = sqldb.loadSqlEquiv(import.meta.url);

const StorageTypes = Object.freeze({
  S3: 'S3',
  FileSystem: 'FileSystem',
});

interface UploadFileOptions {
  /** The display_filename of the file. */
  display_filename: string;
  /** The file contents. */
  contents: Buffer;
  /** The file type. */
  type: string;
  /** The assessment for the file. */
  assessment_id: string | null;
  /** The assessment instance for the file. */
  assessment_instance_id: string | null;
  /** The instance question for the file. */
  instance_question_id: string | null;
  /** The current user performing the update. */
  user_id: string;
  /** The current authenticated user. */
  authn_user_id: string;
  /** AWS 'S3' or 'FileSystem' storage options. */
  storage_type?: string;
}

/**
 * Upload a file into the file store.
 *
 * @param options - The options for the file upload.
 * @return The file_id of the newly created file.
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
}: UploadFileOptions): Promise<string> {
  storage_type = storage_type || config.fileStoreStorageTypeDefault;
  debug(`upload(): storage_type=${storage_type}`);

  let storage_filename;
  if (storage_type === StorageTypes.S3) {
    // use a UUIDv4 as the filename for S3
    storage_filename = uuidv4();
    if (config.fileStoreS3Bucket == null) {
      throw new Error('config.fileStoreS3Bucket is null, which does not allow uploads');
    }

    const res = await uploadToS3(config.fileStoreS3Bucket, storage_filename, null, false, contents);
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
 * @param file_id - The file to delete.
 * @param authn_user_id - The current authenticated user.
 */
export async function deleteFile(file_id: string, authn_user_id: string) {
  debug(`delete(): file_id=${file_id}`);
  debug(`delete(): authn_user_id=${authn_user_id}`);

  await sqldb.queryAsync(sql.delete_file, { file_id, authn_user_id });
  debug('delete(): soft-deleted row in DB');
}

/**
 * Option of returning a stream instead of a file
 *
 * @param file_id - The file to get.
 * @return Requested file stream.
 */
export async function getStream(file_id: number | string): Promise<Stream> {
  debug(`getStream(): file_id=${file_id}`);
  const file = await getFile(file_id, 'stream');
  return file.contents;
}

export async function getFile(
  file_id: number | string,
  data_type: 'stream',
): Promise<{
  contents: Stream;
  file: File;
}>;

export async function getFile(
  file_id: number | string,
  data_type?: 'buffer',
): Promise<{
  contents: Buffer;
  file: File;
}>;
/**
 * Get a file from the file store.
 *
 * @param file_id - The file to get.
 * @return An object with a buffer (of the file contents) and a file object.
 */
export async function getFile(
  file_id: number | string,
  data_type: 'stream' | 'buffer' = 'buffer',
): Promise<{
  contents: Buffer | Stream;
  file: File;
}> {
  const file = await sqldb.queryOptionalRow(sql.select_file, { file_id }, FileSchema);

  if (!file) {
    throw new Error(`No file with file_id ${file_id}`);
  }

  if (file.storage_type === StorageTypes.FileSystem) {
    if (config.filesRoot == null) {
      throw new Error(
        `config.filesRoot must be non-null to get file_id ${file_id} from file store`,
      );
    }

    const filename = path.join(config.filesRoot, file.storage_filename);

    const contents =
      data_type === 'buffer' ? await fsPromises.readFile(filename) : fs.createReadStream(filename);

    return {
      contents,
      file,
    };
  } else if (file.storage_type === StorageTypes.S3) {
    if (config.fileStoreS3Bucket == null) {
      throw new Error(
        `config.fileStoreS3Bucket must be non-null to get file_id ${file_id} from file store`,
      );
    }

    const contents =
      data_type === 'buffer'
        ? await getFromS3(config.fileStoreS3Bucket, file.storage_filename, true)
        : await getFromS3(config.fileStoreS3Bucket, file.storage_filename, false);

    return {
      contents,
      file,
    };
  } else {
    throw new Error(`Unknown storage type: ${file.storage_type}`);
  }
}
