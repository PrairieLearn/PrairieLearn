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

# Fix `lodash` imports
ast-grep -p "import * as _ from 'lodash'" -r "import _ from 'lodash'" -U $ROOT_DIR/apps/*/src

# Convert requires to default imports
ast-grep -p 'const $VAR = require($MODULE)' -r 'import $VAR from $MODULE' -U $ROOT_DIR/apps/*/src $ROOT_DIR/packages/*/src

# Convert TS-stype requires to default imports
ast-grep scan --rule $SCRIPT_DIR/rewrite-typescript-cjs-import.yml -U $ROOT_DIR/apps/*/src $ROOT_DIR/apps/prairielearn/assets
