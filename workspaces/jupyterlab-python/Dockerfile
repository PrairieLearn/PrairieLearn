FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-02-15-14-23-34

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
