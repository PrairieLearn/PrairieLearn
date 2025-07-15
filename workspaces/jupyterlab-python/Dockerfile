FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2025-06-15-14-13-20

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
