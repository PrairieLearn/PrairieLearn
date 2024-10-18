FROM prairielearn/jupyterlab-base

USER root
COPY install.sh requirements.txt pl-gosu-helper.sh /
RUN /bin/bash /install.sh

# Launch jupyterlab as the default jupyterlab user
USER jovyan
CMD ["pl-gosu-helper.sh", "start.sh", "jupyter", "lab"]
