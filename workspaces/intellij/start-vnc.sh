#!/usr/bin/env bash

# VNC -> Websocket proxy layer
websockify :5901 localhost:5900 &

# Start web server
cd /opt/server && node server.js
