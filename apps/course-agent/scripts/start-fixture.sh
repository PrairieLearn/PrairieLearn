#!/usr/bin/env bash
set -euo pipefail

fixture_log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/course-agent-fixture.log"
pnpm --filter @prairielearn/course-agent dev:fixture > "$fixture_log" 2>&1 &

for _attempt in {1..60}; do
    if curl --fail --silent --output /dev/null \
        --header 'Authorization: Bearer local-fixture-service-token-not-a-secret' \
        'http://localhost:8791/agents/chat/ci-ready/diagnostics'; then
        exit 0
    fi
    sleep 1
done

cat "$fixture_log"
exit 1
