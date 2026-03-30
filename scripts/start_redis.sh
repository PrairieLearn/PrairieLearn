#!/bin/bash

# exit if redis is already running
if redis-cli ping > /dev/null 2>&1; then
    echo "[start_redis] Redis is already running, skipping"
    exit
fi

echo "[start_redis] Starting redis..."
redis-server --daemonize yes > /dev/null
echo "[start_redis] Redis started"
