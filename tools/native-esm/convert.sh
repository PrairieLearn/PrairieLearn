#!/bin/bash

set -e

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
ROOT_DIR="$(realpath "${SCRIPT_DIR}/../..")"

# Fix imports of modules which use an "index" file (inside `/lib` directory)
ast-grep scan --rule $SCRIPT_DIR/fix-index-files-in-lib-js.yml -U $ROOT_DIR/apps/prairielearn/src/lib/*.{js,ts}
ast-grep scan --rule $SCRIPT_DIR/fix-index-files-in-lib-ts.yml -U $ROOT_DIR/apps/prairielearn/src/lib/*.{js,ts}

# Fix imports of modules which use an "index" file (outside `/lib` directory)
ast-grep scan --rule $SCRIPT_DIR/fix-index-files-outside-lib-js.yml -U $ROOT_DIR/apps/prairielearn/src
ast-grep scan --rule $SCRIPT_DIR/fix-index-files-outside-lib-ts.yml -U $ROOT_DIR/apps/prairielearn/src

# Add `.js` to all imports of local files
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports-js.yml -U $ROOT_DIR/apps/ $ROOT_DIR/packages/
ast-grep scan --rule $SCRIPT_DIR/rewrite-local-imports-ts.yml -U $ROOT_DIR/apps/ $ROOT_DIR/packages/

