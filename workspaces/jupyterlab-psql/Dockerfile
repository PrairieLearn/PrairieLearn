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

USER jovyan
RUN pip install postgres --user

USER root
RUN find /var/lib/postgresql -user postgres -execdir chown 1001:1001 {} + && \
    find /var/run/postgresql -user postgres -execdir chown 1001:1001 {} + && \
    find /etc/postgresql -user postgres -execdir chown 1001:1001 {} +
RUN chown -R 1001:1001 /tmp/jupyter_config /tmp/local/share/jupyter /tmp/cache /home/jovyan
COPY initdb/world.sql /tmp/initdb/world.sql
RUN chown -R 1001:1001 /tmp/initdb
COPY start-psql.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/start-psql.sh

# Jupyter is only able to use these environment variables dynamically when
# the container is tested locally as root. We don't use Jupyter's
# "CHOWN_HOME" because it doesn't work with how PL places starter files.
USER 1001
ENV NB_UID=1001 NB_GID=1001

# The chown will only succeed in local testing as root and fail in deployment
# as 1001:1001, but we don't care. Join commands with ";", not "&&".
CMD chown -R 1001:1001 /home/jovyan ; start.sh jupyter lab
