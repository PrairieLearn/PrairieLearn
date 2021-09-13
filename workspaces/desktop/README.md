# Desktop GUI Workspace

This image is using Ubuntu 20.04 and provides a desktop environment that users can access from a web browser.  There are a few components that are running to get this working:

 - XVFB (Creates a headless X11 server)
 - x11vnc (Provides the VNC server)
 - Websockify (Provides a TCP VNC -> Websocket layer)
 - Custom Node server (Wraps the VNC stuff and serves the client pages)

### Acknowledgements

On the client side, [noVNC](https://novnc.com/info.html) is used to provide the VNC connection.  Specifically, their noVNC library API and some of their icon assets are used here.  The API and assets are licensed under the MPL 2.0 and CC BY-SA 3.0 licenses, respectively.
