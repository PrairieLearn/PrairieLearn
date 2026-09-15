FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-09-15-14-09-16

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
