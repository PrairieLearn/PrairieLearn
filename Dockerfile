FROM prairielearn/plbase

ENV PATH="/PrairieLearn/node_modules/.bin:$PATH"

# Install Python/NodeJS dependencies before copying code to limit download size
# when code changes.
COPY package.json package-lock.json /PrairieLearn/
COPY grader_host/package.json grader_host/package-lock.json /PrairieLearn/grader_host/
COPY prairielib/package.json prairielib/package-lock.json /PrairieLearn/prairielib/
RUN cd /PrairieLearn \
    && yarn install --frozen-lockfile \
    && cd /PrairieLearn/grader_host \
    && yarn install --frozen-lockfile \
    && cd /PrairieLearn/prairielib \
    && yarn install --frozen-lockfile \
    # Note that we only run this at the very end so that we can reuse the cache
    # between the separate install steps.
    && yarn cache clean

# NOTE: Modify .dockerignore to whitelist files/directories to copy.
COPY . /PrairieLearn/

# set up PrairieLearn and run migrations to initialize the DB
RUN chmod +x /PrairieLearn/docker/init.sh \
    && mkdir /course{,{2..9}} \
    && mkdir -p /workspace_{main,host}_zips \
    && mkdir -p /jobs \
    && /PrairieLearn/docker/start_postgres.sh \
    && cd /PrairieLearn \
    && node server.js --migrate-and-exit \
    && su postgres -c "createuser -s root" \
    && /PrairieLearn/docker/start_postgres.sh stop \
    && /PrairieLearn/docker/gen_ssl.sh \
    && git config --global user.email "dev@illinois.edu" \
    && git config --global user.name "Dev User"

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
