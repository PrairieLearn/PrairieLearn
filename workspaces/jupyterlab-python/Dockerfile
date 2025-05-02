FROM prairielearn/jupyterlab-base:latest
ARG CACHEBUST=2025-04-15-14-15-50

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

USER jovyan
