#!/bin/bash

# Copy over config files
cp -r /opt/defaults/config /home/prairielearner/.config
cp -r /opt/defaults/local /home/prairielearner/.local
cp /opt/defaults/.profile /home/prairielearner/.profile
cp /opt/defaults/.bashrc /home/prairielearner/.bashrc

chown -R 1001:1001 /home/prairielearner/.config
chown -R 1001:1001 /home/prairielearner/.local

# VNC -> Websocket proxy layer
websockify :5901 localhost:5900 &

# Start web server
cd /opt/server && node server.js
