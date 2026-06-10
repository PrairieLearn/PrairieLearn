#!/bin/bash -e

# NOTE: This script is used to typecheck a single file.
# This may not work in all cases, see https://github.com/PrairieLearn/PrairieLearn/pull/13830#discussion_r2706300244

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

# Find module augmentation files
# These need to be included to ensure type augmentations are applied
# Searches for both "declare module" and "declare global" patterns
find_module_augmentation_files() {
    # Search the given directory (the tsconfig's directory, mirroring what the
    # project's own `include` would cover) for .ts and .d.ts files containing
    # augmentations. Exclude node_modules, dist, build, and client directories
    # (client directories contain DOM-dependent code that may not be compatible with server tsconfigs)
    grep -rlE "declare (module|global)" \
        --include="*.ts" --include="*.d.ts" \
        --exclude-dir=node_modules \
        --exclude-dir=dist \
        --exclude-dir=build \
        --exclude-dir=client \
        --exclude-dir=assets \
        --exclude-dir=.claude \
        "$1" 2> /dev/null || true
}

# Build list of "tsconfig|file" pairs
pairs=""
for file in "$@"; do
    # Convert absolute paths to relative paths from the current directory
    if [[ "$file" == /* ]]; then
        file="${file#$PWD/}"
    fi
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

    # Find module augmentation files within this tsconfig's directory tree
    augmentation_files=$(find_module_augmentation_files "$(dirname "$tsconfig")")

    tsconfig_dir=$(dirname "$tsconfig")
    tsconfig_name=$(basename "$tsconfig")

    # Build include array. Use absolute paths so the temporary config can live
    # next to the real tsconfig, where package-local @types dependencies resolve.
    includes=""
    for file in $files; do
        if [[ "$file" != /* ]]; then
            file="$PWD/$file"
        fi
        if [ -n "$includes" ]; then
            includes="$includes,"
        fi
        includes="$includes\"$file\""
    done

    # Add module augmentation files to includes (avoiding duplicates)
    for aug_file in $augmentation_files; do
        # Skip if this file is already in the includes list
        if echo "$files" | grep -qF "$aug_file"; then
            continue
        fi
        if [[ "$aug_file" != /* ]]; then
            aug_file="$PWD/$aug_file"
        fi
        if [ -n "$includes" ]; then
            includes="$includes,"
        fi
        includes="$includes\"$aug_file\""
    done

    TMP=$(mktemp "$tsconfig_dir/.tsconfig-lint.XXXXXX")
    TMP_FILES+=("$TMP")

    cat > "$TMP" << EOF
{
  "extends": "./$tsconfig_name",
  "include": [$includes]
}
EOF

    pnpm tsgo --project "$TMP" --skipLibCheck --noEmit || exit_code=$?
    rm -f "$TMP"
done

exit $exit_code
