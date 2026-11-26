FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-11-15-14-04-41

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
