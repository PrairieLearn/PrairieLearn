const ERR = require('async-stacktrace');
const _ = require('lodash');
const path = require('path');
const fsPromises = require('fs').promises;
const uuidv4 = require('uuid/v4');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('@prairielearn/prairielib/sql-db');
const config = require('../lib/config');

module.exports = {

    /**
     * Upload a file into the file store.
     *
     * @param {string} display_filename - The display_filename of the file.
     * @param {buffer} contents - The file contents.
     * @param {string} type - The file type.
     * @param {number} assessment_instance_id - The assessment instance for the file.
     * @param {number|null} instance_question_id - The instance question for the file.
     * @param {number} user_id - The current user performing the update.
     * @param {number} authn_user_id - The current authenticated user.
     */
    async uploadFile(display_filename, contents, type, assessment_instance_id, instance_question_id, user_id, authn_user_id) {
        debug('uploadFile()');
        // Make a filename to store the file. We use a UUIDv4 as the filename,
        // and put it in two levels of directories corresponding to the first-3
        // and second-3 characters of the filename.
        const f = uuidv4();
        const relDir = path.join(f.slice(0,3), f.slice(3,6));
        const storage_filename = path.join(relDir, f.slice(6));
        if (config.filesRoot == null) throw new Error('config.filesRoot is null, which does not allow uploads');
        const dir = path.join(config.filesRoot, relDir);
        const filename = path.join(config.filesRoot, storage_filename);

        debug(`uploadFile(): mkdir ${dir}`);
        await fsPromises.mkdir(dir, {recursive: true, mode: 0o700});
        debug(`uploadFile(): writeFile ${filename}`);
        await fsPromises.writeFile(filename, contents, {mode: 0o600});
        const params = [
            display_filename,
            storage_filename,
            type,
            assessment_instance_id,
            instance_question_id,
            user_id,
            authn_user_id,
        ];
        await sqldb.callAsync('files_insert', params);
        debug('uploadFile(): inserted files row into DB');
    },
};
