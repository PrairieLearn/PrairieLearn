FROM prairielearn/workspace-jupyterlab-base:latest
ARG CACHEBUST=2026-03-15-14-27-00

USER root
COPY install.sh /
RUN /bin/bash /install.sh

USER jovyan

# Tell Jupyter to hide the Python kernel
ENV HIDE_PYTHON_KERNEL=true
