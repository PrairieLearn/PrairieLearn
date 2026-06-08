FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-05-15-14-49-21

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
