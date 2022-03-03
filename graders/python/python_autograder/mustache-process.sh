#!/usr/bin/env bash

# Mustache processing intended primarily for use with PrairieLearn external graders.
# Bash script template based on https://betterdev.blog/minimal-safe-bash-script-template/
#
#
# For use in a PrairieLearn autograder: Ensure your Docker image has mustache. E.g., add
# this or the equivalent for your installation system to your Dockerfile:
# 
#   RUN yum install -y rubygems && gem install mustache
#
# Then, place this script in your autograder server files (or your Docker image).
# Then, run this script with no arguments as part of your entrypoint script in whatever 
# directory you want to process when you want to perform processing. E.g.:
#
#   (cd /grade/tests/ && /grade/shared/autograder/mustache-process.sh)
#
# You may want to use the -d option to delete the original .mustache files. HOWEVER,
# it's also handy in your testing directory to soft-link your .mustache file to a
# non-.mustache version (which you can then use as your test harness, if you're
# careful with how you use {{...}}). If you do that and use -d, you'll end up just
# deleting both files.
#
# (You'll adjust that to get the mustache-process.sh path right, most likely changing
# "autograder".) You almost certainly want to perform processing before testing student
# code!
#
# If you/your programming language already uses {{ }} as syntactically meaningful,
# see https://mustache.github.io/mustache.5.html#Set-Delimiter.

set -Eeuo pipefail
shopt -s globstar extglob nullglob

MUSTACHE_FILE_PATTERN=".mustache"
EXTENSION_GLOB="**/?*${MUSTACHE_FILE_PATTERN}?(.*)"
DEFAULT_DATA_SOURCE=/grade/data/data.json
DATA_SOURCE="${DEFAULT_DATA_SOURCE}"
RETAIN="yes"

# Temp file management based on https://unix.stackexchange.com/a/181938
TEMPFILE=$(mktemp /tmp/mustache-process.XXXXXX)
exec 3>"$TEMPFILE"  # echo ... >&3 writes to that file
exec 4<"$TEMPFILE"  # <&4 reads from the file
rm "$TEMPFILE"      # deletes the directory entry for the file, but retains the inode
# File is automatically deleted when the script ends.


USAGE=$(cat <<EOF
Usage: $(basename "${BASH_SOURCE[0]}") [-h] [<formatter>]

Mustache expansion for files in the current subtree with the extension ${MUSTACHE_FILE_PATTERN}.
Results are placed in files with matching paths but without the ${MUSTACHE_FILE_PATTERN} extension.
Formats using <formatter>, defaulting to "${DEFAULT_DATA_SOURCE}".

The extension ${MUSTACHE_FILE_PATTERN} can appear anywhere in the filename
(set off by periods) except at the start, e.g., "foo${MUSTACHE_FILE_PATTERN}.txt".
The subtree is defined by "**"; so, hidden directories are not processed.

Available options:

-d, --delete    Delete the original ${MUSTACHE_FILE_PATTERN} files
-h, --help      Print this help and exit
-v, --verbose   Print script debug info (bash -x option)
EOF
)

usage() {
  echo "${USAGE}"
  exit
}

msg() {
  echo >&2 -e "${1-}"
}

die() {
  local msg=$1
  local code=${2-1} # default exit status 1
  msg "$msg"
  exit "$code"
}

dieUI() {
  local msg=$1
  local code=${2-1}
  msg "$msg"
  msg "\n${USAGE}"
  exit "$code"
}

parse_params() {
  while :; do
    case "${1-}" in
    -d | --delete) RETAIN="no" ;; 
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    -?*) dieUI "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  # Optional argument
  if [[ $# -gt 0 ]]
  then
    DATA_SOURCE="${1-}"
    shift
  else
    msg "Using default formatter location: ${DATA_SOURCE}"
  fi

  # Check for disallowed arguments:
  [[ $# -gt 0 ]] && dieUI "Too many arguments provided"

  return 0
}

parse_params "$@"

# script logic here

if [[ ! -x $(command -v mustache) ]]
then
    die "mustache command not found; see https://mustache.github.io/"
fi

if [[ ! -f "${DATA_SOURCE}" ]]
then
    die "No formatter file found at: ${DATA_SOURCE}"
fi

msg "Using formatter: ${DATA_SOURCE}"

# Test formatting of data source
mustache "${DATA_SOURCE}" /dev/null 2> /dev/null || die "Not recognized as valid YAML/JSON formatter: ${DATA_SOURCE}"

matches=($EXTENSION_GLOB)
msg "Processing ${MUSTACHE_FILE_PATTERN} files."
for i in ${matches[@]+"${matches[@]}"}
do
    basei="${i/.mustache/}"
    msg "  Processing ${i}"
    # Inserting a temporary file in case one file is a symlink to the other!
    mustache "${DATA_SOURCE}" "${i}" >&3 && cat <&4 > "${basei}"
    if [[ "${RETAIN}" != "yes" ]] 
    then
      rm "${i}"
    fi
done
msg "Done processing ${MUSTACHE_FILE_PATTERN} files."