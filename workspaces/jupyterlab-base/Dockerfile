FROM jupyter/minimal-notebook:2023-10-20

ENV XDG_DATA_HOME=/tmp/local/share
ENV XDG_CACHE_HOME=/tmp/cache
ENV XDG_CONFIG_HOME=/tmp/config
ENV JUPYTER_RUNTIME_DIR /tmp/runtime
ENV JUPYTER_ALLOW_INSECURE_WRITES true
ENV JUPYTER_CONFIG_DIR=/tmp/jupyter_config
ENV NPM_CONFIG_CACHE=/tmp/npm
ENV NO_UPDATE_NOTIFIER=true
ENV IPYTHONDIR=/tmp/ipython
ENV YARN_CACHE_FOLDER=/tmp/yarn_cache

USER root
# Update the image
RUN apt-get update && apt-get -y upgrade
# Remove temporary files to reduce image size
RUN apt-get clean && rm -rf /var/lib/apt/lists/*
# Suppress the opt-in dialog for announcements.
# https://stackoverflow.com/questions/75511508/how-to-stop-this-message-would-you-like-to-receive-official-jupyter-news
RUN jupyter labextension disable @jupyterlab/apputils-extension:announcements
# Copy over our custom jupyter config
COPY jupyter_server_config.py /etc/jupyter/
