FROM ubuntu:22.04

ENV DEBIAN_FRONTEND noninteractive
COPY pre-install.sh /pre-install.sh
RUN /bin/bash /pre-install.sh
COPY code.desktop /usr/share/applications/code.desktop

COPY pl-gosu-helper.sh /pl-gosu-helper.sh
COPY start-vnc.sh /start-vnc.sh
COPY config /opt/defaults/config
COPY local /opt/defaults/local
COPY server /opt/server

COPY post-install.sh /post-install.sh
RUN /bin/bash /post-install.sh

USER 1001
ENV PL_USER prairielearner

CMD /pl-gosu-helper.sh /start-vnc.sh
