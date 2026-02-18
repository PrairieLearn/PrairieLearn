#!/usr/bin/env bash
set -euo pipefail

# Runs the drawingLatexSafari e2e test with an old WebKit (webkit-2083, ~Safari 18.0)
# that reproduces the outerHTML XML serialization bug.
#
# Usage:
#   ./apps/prairielearn/src/tests/e2e/run-safari-test.sh [BASE_URL]
#
# Arguments:
#   BASE_URL  URL of the running PrairieLearn dev server (default: auto-detected)
#
# The script will:
#   1. Set up a temporary directory with Playwright 1.48.0
#   2. Install the old WebKit browser (webkit-2083)
#   3. Auto-detect the dev server port (or use BASE_URL argument)
#   4. Look up the correct question URL from the database
#   5. Run the test

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
TEST_FILE="$SCRIPT_DIR/drawingLatexSafari.spec.ts"
TEMP_DIR="/tmp/pw-safari-test-$$"
BROWSERS_PATH="${HOME}/Library/Caches/ms-playwright"

# Old Playwright version that ships with webkit-2083 (~Safari 18.0)
PW_VERSION="1.48.0"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "==> Setting up Playwright ${PW_VERSION} with old WebKit..."
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"
npm init -y --silent >/dev/null 2>&1
npm install --silent "playwright@${PW_VERSION}" "@playwright/test@${PW_VERSION}" >/dev/null 2>&1

# Install old WebKit if not already present
if [ ! -d "$BROWSERS_PATH/webkit-2083" ]; then
  echo "==> Installing WebKit 2083 (Safari 18.0)..."
  PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH" npx playwright install webkit
else
  echo "==> WebKit 2083 already installed"
fi

# Create minimal playwright config
cat > playwright.config.ts << 'EOF'
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
EOF

# Auto-detect dev server if BASE_URL not provided
if [ -n "${1:-}" ]; then
  BASE_URL="$1"
elif [ -n "${BASE_URL:-}" ]; then
  : # use existing env var
elif [ -n "${CONDUCTOR_PORT:-}" ]; then
  BASE_URL="http://localhost:${CONDUCTOR_PORT}"
else
  PORT=$(lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep node | grep -oE ':[0-9]+' | head -1 | tr -d ':')
  if [ -z "$PORT" ]; then
    echo "ERROR: Could not detect dev server port. Pass BASE_URL as argument or start 'make dev'."
    exit 1
  fi
  BASE_URL="http://localhost:${PORT}"
fi
echo "==> Using dev server: ${BASE_URL}"

# Look up the question URL from the database
QUESTION_URL=$(psql -d postgres -t -A -c "
  SELECT '/pl/course/' || c.id || '/question/' || q.id || '/preview'
  FROM questions q
  JOIN pl_courses c ON q.course_id = c.id
  WHERE q.qid = 'element/drawingGallery'
    AND q.deleted_at IS NULL
    AND c.short_name = 'XC 101'
  LIMIT 1;
" 2>/dev/null || echo "")

if [ -z "$QUESTION_URL" ]; then
  echo "WARNING: Could not look up question URL from database, using default"
  QUESTION_URL="/pl/course/1/question/111/preview"
fi
echo "==> Question URL: ${QUESTION_URL}"

# Copy test file into temp dir (Playwright 1.48 won't find files outside the project)
cp "$TEST_FILE" "$TEMP_DIR/"

echo "==> Running test with WebKit 2083 (Safari 18.0)..."
PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_PATH" \
  BASE_URL="$BASE_URL" \
  QUESTION_URL="$QUESTION_URL" \
  npx playwright test drawingLatexSafari.spec.ts \
    --project=webkit \
    --headed \
    --reporter=list
