FROM prairielearn/workspace-jupyterlab-python:latest

RUN mkdir -p /tmp/jupyter_config
RUN mkdir -p /tmp/local/share/jupyter

USER root

# Install PostgreSQL client
RUN apt-get update && apt-get install -y postgresql-client

# Install necessary Python libraries
RUN pip install ipython-sql sqlalchemy psycopg2-binary jupyterlab_sql

RUN apt-get install -y postgresql

# Ensure JupyterLab extensions are correctly installed
RUN jupyter lab build

COPY initdb/world.sql /home/jovyan/work/world.sql

RUN chown -R 1001:1001 /tmp/jupyter_config
RUN chown -R 1001:1001 /tmp/local/share/jupyter
RUN chown -R 1001:1001 /home/jovyan/work/world.sql

USER jovyan

EXPOSE 5432

RUN pip install postgres --user

CMD jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root