#!/bin/bash

# Redis is provided externally; exit with no action
if [[ -n "$REDIS_HOST" ]]; then
    exit 0
fi

# exit if redis is already running
if redis-cli ping > /dev/null 2>&1; then
    exit
fi

redis-server --daemonize yes > /dev/null
