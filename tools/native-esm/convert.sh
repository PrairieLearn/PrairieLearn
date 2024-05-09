#!/bin/bash

set -e

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
ROOT_DIR="$(realpath "${SCRIPT_DIR}/../..")"

# Start with a clean slate
git checkout apps packages

# `ast-grep` rules don't support multiple languages:
# https://github.com/ast-grep/ast-grep/issues/525
#
# To keep ourselves sane, we'll consruct the TypeScript rules from the
# JavaScript rules.
for file in $SCRIPT_DIR/*.js.yml; do
  ts_file="${file%.js.yml}.ts.yml"
  cp "$file" "$ts_file"

  # Replace `language: JavaScript` with `language: TypeScript`
  sed -i '' 's/language: JavaScript/language: TypeScript/' "$ts_file"
done

# Fix imports of modules in `lib/` which use an "index" file
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files.js.yml -U $ROOT_DIR/apps/prairielearn/src
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files.ts.yml -U $ROOT_DIR/apps/prairielearn/src

# Fix imports of things like `sprocs` and `cron`
ast-grep scan --rule $SCRIPT_DIR/fix-index-files.js.yml -U $ROOT_DIR/apps/prairielearn/src
ast-grep scan --rule $SCRIPT_DIR/fix-index-files.ts.yml -U $ROOT_DIR/apps/prairielearn/src

# Add `.js` to all imports of local files
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports.js.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports.ts.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-dynamic-imports.js.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-dynamic-imports.ts.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src

# Fix `loadSqlEquiv` calls
ast-grep -p 'loadSqlEquiv(__filename)' -r 'loadSqlEquiv(import.meta.url)' -U $ROOT_DIR/apps/*/src
ast-grep -p '$SQLDB.loadSqlEquiv(__filename)' -r '$SQLDB.loadSqlEquiv(import.meta.url)' -U $ROOT_DIR/apps/*/src

# Fix `renderEjs` calls
ast-grep -p 'renderEjs(__filename, $$$ARGS)' -r 'renderEjs(import.meta.url, $$$ARGS)' -U $ROOT_DIR/apps/*/src

# Fix `lodash` imports
ast-grep -p "import * as _ from 'lodash'" -r "import _ from 'lodash'" -U $ROOT_DIR/apps/*/src

# Convert requires to default imports
ast-grep -p 'const $VAR = require($MODULE)' -r 'import $VAR from $MODULE' -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src
ast-grep -p 'var $VAR = require($MODULE)' -r 'import $VAR from $MODULE' -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src

# Convert TS-type requires to default imports
ast-grep scan --rule $SCRIPT_DIR/rewrite-typescript-cjs-import.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/apps/prairielearn/assets

# Convert require statements in `server.js` and friends to dynamic imports
ast-grep -p 'require('"'"'$PATH'"'"').default' -r '(await import('"'"'$PATH.js'"'"')).default' -U $ROOT_DIR/apps/prairielearn/src/server.js $ROOT_DIR/apps/prairielearn/src/api/v1/index.js

# Convert `__dirname` to `import.meta.dirname`
ast-grep -p '__dirname' -r 'import.meta.dirname' -U $ROOT_DIR/apps/*/src

# Covnert `__filename` to `import.meta.filename`
ast-grep -p '__filename' -r 'import.meta.filename' -U $ROOT_DIR/apps/*/src

# Use default import for modules where appropriate
ast-grep -p "import * as fs from 'fs-extra'" -r "import fs from 'fs-extra'" -U $ROOT_DIR/apps/*/src
ast-grep -p "import * as jju from 'jju'" -r "import jju from 'jju'" -U $ROOT_DIR/apps/*/src
ast-grep -p "import * as mustache from 'mustache'" -r "import mustache from 'mustache'" -U $ROOT_DIR/apps/*/src
ast-grep -p "import * as pg from 'pg'" -r "import pg from 'pg'" -U $ROOT_DIR/apps/*/src

make -C $ROOT_DIR format-js
