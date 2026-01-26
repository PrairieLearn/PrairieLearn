FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-01-15-14-21-34

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
