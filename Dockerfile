FROM prairielearn/centos7-plbase

# Install Python/NodeJS dependencies before copying code to limit download size
# when code changes.
COPY package.json package-lock.json /PrairieLearn/
RUN cd /PrairieLearn \
    && npm ci \
    && npm --force cache clean

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

# set up PrairieLearn and run migrations to initialize the DB
RUN chmod +x /PrairieLearn/docker/init.sh \
    && mv /PrairieLearn/docker/config.json /PrairieLearn \
    && mkdir /course \
    && /PrairieLearn/docker/start_postgres.sh \
    && cd /PrairieLearn \
    && node server.js --migrate-and-exit \
    && su postgres -c "createuser root" \
    && su postgres -c 'psql -c "alter user root with superuser;"' \
    && /PrairieLearn/docker/start_postgres.sh stop

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
