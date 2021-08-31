#/bin/sh
# VNC -> Websocket proxy layer
websockify :5901 localhost:5900 &

# VNC server
x11vnc -create -env FD_PROG=/usr/bin/xfce4-session -env X11VNC_FINDDISPLAY_ALWAYS_FAILS=1 -xkb -forever -shared -repeat -capslock &

# Start web server
sleep 2
cd /opt/server && node server.js
