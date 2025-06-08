FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2025-05-15-14-16-41

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
