#!/bin/bash

set -e

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
ROOT_DIR="$(realpath "${SCRIPT_DIR}/../..")"

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

# Fix imports of modules in `/lib` which use an "index" file (inside `/lib` directory)
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files-in-lib.js.yml -U $ROOT_DIR/apps/prairielearn/src/lib/*.{js,ts}
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files-in-lib.ts.yml -U $ROOT_DIR/apps/prairielearn/src/lib/*.{js,ts}

# Fix imports of modules in `lib/` which use an "index" file (outside `/lib` directory)
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files-outside-lib.js.yml -U $ROOT_DIR/apps/prairielearn/src
ast-grep scan --rule $SCRIPT_DIR/fix-lib-index-files-outside-lib.ts.yml -U $ROOT_DIR/apps/prairielearn/src

# Fix imports of things like `sprocs` and `cron`
ast-grep scan --rule $SCRIPT_DIR/fix-index-files.js.yml -U $ROOT_DIR/apps/prairielearn/src
ast-grep scan --rule $SCRIPT_DIR/fix-index-files.ts.yml -U $ROOT_DIR/apps/prairielearn/src

# Add `.js` to all imports of local files
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports.js.yml -U $ROOT_DIR/apps/ $ROOT_DIR/packages/
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports.ts.yml -U $ROOT_DIR/apps/ $ROOT_DIR/packages/

ast-grep -p 'loadSqlEquiv(__filename)' -r 'loadSqlEquiv(import.meta.url)' -U $ROOT_DIR/apps/


