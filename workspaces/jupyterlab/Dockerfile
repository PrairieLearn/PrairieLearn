FROM jupyter/datascience-notebook
COPY jupyter_notebook_config.py /etc/jupyter/
ENV JUPYTER_RUNTIME_DIR /tmp/runtime
ENV JUPYTER_ALLOW_INSECURE_WRITES true
CMD ["start.sh", "jupyter", "lab"]
