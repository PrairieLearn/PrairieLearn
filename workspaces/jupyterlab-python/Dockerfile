FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-06-15-15-59-28

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
