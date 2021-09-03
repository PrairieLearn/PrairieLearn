FROM ubuntu:20.04

COPY pre-install.sh /pre-install.sh
RUN /bin/sh /pre-install.sh
COPY code.desktop /usr/share/applications/code.desktop

COPY start-vnc.sh /start-vnc.sh
COPY config /opt/defaults/config
COPY local /opt/defaults/local
COPY server /opt/server

COPY post-install.sh /post-install.sh
RUN /bin/sh /post-install.sh

USER 1001
CMD /bin/sh /start-vnc.sh
