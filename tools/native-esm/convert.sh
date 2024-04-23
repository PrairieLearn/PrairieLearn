#!/bin/bash

set -e

# Add `.js` to all imports of local files
ast-grep scan --rule rewrite-local-imports-js.yml -U apps/
asg-grep scan --rule rewrite-local-imports-ts.yml -U apps/
