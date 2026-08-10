FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-07-15-14-34-04

USER root
COPY install.sh /
RUN /bin/bash /install.sh

USER jovyan

# Tell Jupyter to hide the Python kernel
ENV HIDE_PYTHON_KERNEL=true
