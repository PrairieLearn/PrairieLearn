FROM quay.io/jupyter/minimal-notebook:2025-06-30
ARG CACHEBUST=2025-06-15-14-13-20

ENV XDG_DATA_HOME=/tmp/local/share
ENV XDG_CACHE_HOME=/tmp/cache
ENV XDG_CONFIG_HOME=/tmp/config
ENV JUPYTER_RUNTIME_DIR=/tmp/runtime
ENV JUPYTER_ALLOW_INSECURE_WRITES=true
ENV JUPYTER_CONFIG_DIR=/tmp/jupyter_config
ENV NPM_CONFIG_CACHE=/tmp/npm
ENV NO_UPDATE_NOTIFIER=true
ENV IPYTHONDIR=/tmp/ipython
ENV YARN_CACHE_FOLDER=/tmp/yarn_cache

USER root
COPY install.sh requirements.txt pl-gosu-helper.sh /
RUN /bin/bash /install.sh
COPY jupyter_server_config.py /etc/jupyter/

USER jovyan
# This is replicating the entrypoint that Jupyter had specified in their base
# image, but we inject our pl-gosu-helper.sh before the Jupyter start script.
# Jupyter chose to use tini for benefits like "reaping zombies and performing
# signal forwarding" (quoting from the tini GitHub page).
ENTRYPOINT ["tini", "-g", "--", "pl-gosu-helper.sh", "start.sh", "jupyter", "lab"]
