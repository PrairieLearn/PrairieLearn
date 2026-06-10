#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d /grade ]]; then
  echo "ERROR: /grade not found! Mounting may have failed."
  exit 1
fi

JOB_DIR=/grade
STUDENT_DIR="$JOB_DIR/student"
TEST_DIR="$JOB_DIR/tests"
DATA_DIR="$JOB_DIR/data"
OUT_DIR="$JOB_DIR/results"
RUN_DIR="$JOB_DIR/run"

mkdir -p "$RUN_DIR" "$OUT_DIR" "$RUN_DIR/student" "$RUN_DIR/tests" "$RUN_DIR/data"

if compgen -G "$STUDENT_DIR/*" > /dev/null; then
  cp -R "$STUDENT_DIR"/. "$RUN_DIR/student" 2>/dev/null || true
fi

if compgen -G "$TEST_DIR/*" > /dev/null; then
  cp -R "$TEST_DIR"/. "$RUN_DIR/tests" 2>/dev/null || true
fi

if compgen -G "$DATA_DIR/*" > /dev/null; then
  cp -R "$DATA_DIR"/. "$RUN_DIR/data" 2>/dev/null || true
fi

touch "$RUN_DIR/output-fname.txt"
SECRET_NAME="$RUN_DIR/$(uuidgen)"
printf '%s' "$SECRET_NAME" > "$RUN_DIR/output-fname.txt"

chown -R ag:ag "$RUN_DIR" "$OUT_DIR"
chmod -R u+rwX,go+rX "$RUN_DIR" "$OUT_DIR"

su -s /bin/bash ag -c 'julia --startup-file=no --history-file=no /julia_autograder/main.jl'

if [[ -f "$SECRET_NAME" ]]; then
  mv "$SECRET_NAME" "$OUT_DIR/results.json"
fi

if [[ ! -s "$OUT_DIR/results.json" ]]; then
  cat > "$OUT_DIR/results.json" <<'JSON'
{"succeeded":false,"gradable":false,"score":0.0,"message":"Your code could not be processed by the autograder. Please contact course staff and have them check the logs for this submission."}
JSON
fi
