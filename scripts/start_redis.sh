#!/bin/bash

# exit if redis is already running
if redis-cli ping > /dev/null 2>&1; then
    exit
fi

redis-server --daemonize yes > /dev/null
