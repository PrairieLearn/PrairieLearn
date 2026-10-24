/** The temporary index captures the working tree without changing the agent's staging. */
export const freezeReviewScript = `
  cd "$2"
  export GIT_INDEX_FILE=$(mktemp)
  trap 'rm -f "$GIT_INDEX_FILE"' EXIT
  git -c safe.directory='*' read-tree "$1"
  git -c safe.directory='*' -c core.autocrlf=false -c core.filemode=true add -A -- .
  git -c safe.directory='*' -c core.quotePath=true diff --cached --binary --full-index --no-ext-diff --no-textconv --no-renames "$1" --
`;
