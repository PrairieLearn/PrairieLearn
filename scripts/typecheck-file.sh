#!/bin/bash -e

if [ $# -eq 0 ]; then
  echo "Usage: $0 <file1.ts> [file2.ts] ..." >&2
  exit 1
fi

# Find the nearest tsconfig.json for a file
find_tsconfig() {
  local dir
  dir=$(dirname "$1")
  while [ "$dir" != "." ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/tsconfig.json" ]; then
      echo "$dir/tsconfig.json"
      return
    fi
    dir=$(dirname "$dir")
  done
  echo "tsconfig.json"
}

# Build list of "tsconfig|file" pairs
pairs=""
for file in "$@"; do
  tsconfig=$(find_tsconfig "$file")
  pairs="$pairs$tsconfig|$file"$'\n'
done

# Get unique tsconfigs
tsconfigs=$(echo "$pairs" | cut -d'|' -f1 | sort -u)

# Run tsc once per tsconfig with all its files
TMP_FILES=()
cleanup() {
  for f in "${TMP_FILES[@]}"; do
    rm -f "$f"
  done
}
trap cleanup EXIT

exit_code=0
for tsconfig in $tsconfigs; do
  # Get all files for this tsconfig
  files=$(echo "$pairs" | awk -F'|' -v tc="$tsconfig" '$1 == tc {print $2}' | tr '\n' ' ')

  # Build include array
  includes=""
  for file in $files; do
    if [ -n "$includes" ]; then
      includes="$includes,"
    fi
    includes="$includes\"$file\""
  done

  TMP=$(mktemp .tsconfig-lint.XXXXXX.json)
  TMP_FILES+=("$TMP")

  cat >"$TMP" <<EOF
{
  "extends": "./$tsconfig",
  "include": [$includes]
}
EOF

  yarn tsgo --project "$TMP" --skipLibCheck --noEmit || exit_code=$?
  rm -f "$TMP"
done

exit $exit_code
