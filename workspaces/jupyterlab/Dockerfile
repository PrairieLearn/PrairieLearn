FROM jupyter/datascience-notebook:aec555e49be6
COPY jupyter_notebook_config.py /etc/jupyter/

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

CMD ["start.sh", "jupyter", "lab"]
