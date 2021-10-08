#!/usr/bin/env python

# This replaces OLD_STRING with NEW_STRING in all files (recursing
# into subdirectories). The NEW_STRING is a relative path based at the
# starting directory. This has '../' prepended to it for each level of
# directory recursion. For example:
#
# file1.txt            --> replace OLD_STRING with NEW_PREFIX + NEW_STRING
# dir1/file2.txt       --> replace OLD_STRING with NEW_PREFIX + "../" + NEW_STRING
# dir1/dir2/file3.txt  --> replace OLD_STRING with NEW_PREFIX + "../../" + NEW_STRING
#
# If NEW_STRING is None then it it not used and only a simple
# replacement with NEW_PREFIX is performed.


import os

def replace_in_file(filename, old_string, replace_string):
    print(filename)
    contents = ''
    with open(filename) as f:
        contents = f.read()
    contents = contents.replace(old_string, replace_string)
    with open(filename, 'w') as f:
        f.write(contents)

def walk_directory(dirname, old_string, new_prefix, new_string=None):
    for localname in os.listdir(dirname):
        filename = os.path.join(dirname, localname)
        if localname.startswith('.') or localname == 'prairielib' or localname == 'node_modules':
            continue
        if os.path.isfile(filename) and filename.endswith('.js'):
            replace_string = new_prefix + new_string if new_string is not None else new_prefix
            replace_in_file(filename, old_string, replace_string)
        if os.path.isdir(filename):
            relative_new_string = '../' + new_string if new_string is not None else None
            walk_directory(filename, old_string, new_prefix, relative_new_string)

# first standardize the require() format
walk_directory('.', "require('@prairielearn/prairielib').error", "require('@prairielearn/prairielib/error')")
walk_directory('.', "require('@prairielearn/prairielib').util", "require('@prairielearn/prairielib/util')")
walk_directory('.', "require('@prairielearn/prairielib').sqlLoader", "require('@prairielearn/prairielib/sql-loader')")
walk_directory('.', "require('@prairielearn/prairielib').sqlDb", "require('@prairielearn/prairielib/sql-db')")
walk_directory('.', "require('@prairielearn/prairielib').sqldb", "require('@prairielearn/prairielib/sql-db')")
walk_directory('.', "const { config: configLib } = require('@prairielearn/prairielib');", "const configLib = require('@prairielearn/prairielib/config');")
walk_directory('.', "const { sqldb } = require('@prairielearn/prairielib');", "const sqldb = require('@prairielearn/prairielib/sql-db');")
walk_directory('.', "const { error, sqlDb } = require('@prairielearn/prairielib');",
               """const error = require('@prairielearn/prairielib/error');
const sqlDb = require('@prairielearn/prairielib/sql-db');""")
walk_directory('.', "const { error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');",
               """const error = require('@prairielearn/prairielib/error');
const sqlDb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');""")
walk_directory('.', "const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');",
               """const sqlDb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');""")
walk_directory('.', "const { sqlDb, sqlLoader} = require('@prairielearn/prairielib');",
               """const sqlDb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');""")
walk_directory('.', "const { sqldb, migrations } = require('@prairielearn/prairielib');",
               """const sqldb = require('@prairielearn/prairielib/sql-db');
const migrations = require('@prairielearn/prairielib/migrations');""")
walk_directory('.', "const { sqldb, sqlLoader } = require('@prairielearn/prairielib');",
               """const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');""")
walk_directory('.', "const { sqldb, sqlLoader, error } = require('@prairielearn/prairielib');",
               """const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const error = require('@prairielearn/prairielib/error');""")
walk_directory('.', "const {sqlDb, sqlLoader} = require('@prairielearn/prairielib');",
               """const sqlDb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');""")

# do the actual change
walk_directory('.', '@prairielearn/prairielib', '', 'prairielib/lib')

# fix up bare "prairielib/..." paths in server.js
replace_in_file('server.js', "require('prairielib", "require('./prairielib")
