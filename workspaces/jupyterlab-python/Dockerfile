FROM prairielearn/jupyterlab-base

USER root
COPY install.sh requirements.txt /
RUN /bin/bash /install.sh

# Launch jupyterlab as the default jupyterlab user
USER jovyan
CMD ["start.sh", "jupyter", "lab"]
