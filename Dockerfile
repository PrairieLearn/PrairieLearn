FROM prairielearn/plbase:${PRAIRIELEARN_IMAGE_TAG:-latest}

ENV PATH="/PrairieLearn/node_modules/.bin:$PATH"

# Note that we have to copy the `packages` and `apps` directories into the
# image so that `yarn` can resolve the workspaces inside them and set up
# symlinks correctly.
#
# This is suboptimal, as a change to any file in these directories will
# invalidate this layer's cache, but it's the best option we have for now.
# The alternative is to use a separate `COPY` step for each package/app, but
# this is inexplicably slow on GitHub Actions, taking about 2.5 minutes just to
# execute the `COPY` steps. If Docker implements `COPY --parents` as described
# in https://github.com/moby/moby/issues/35639, we can use that and copy globs
# instead, which should give us the best of both worlds.
#
# We also need to copy both the `.yarn` directory and the `.yarnrc.yml` file,
# both of which are necessary for Yarn to correctly install dependencies.
COPY .yarn/ /PrairieLearn/.yarn/
COPY package.json yarn.lock .yarnrc.yml /PrairieLearn/
COPY packages/ /PrairieLearn/packages/
COPY apps/ /PrairieLearn/apps/

# Install Node dependencies.
RUN cd /PrairieLearn && yarn install --immutable  && yarn cache clean

# NOTE: Modify .dockerignore to allowlist files/directories to copy.
COPY . /PrairieLearn/

# set up PrairieLearn and run migrations to initialize the DB
RUN chmod +x /PrairieLearn/docker/init.sh \
    && mkdir /course{,{2..9}} \
    && mkdir -p /workspace_{main,host}_zips \
    && mkdir -p /jobs \
    && /PrairieLearn/docker/start_postgres.sh \
    && cd /PrairieLearn \
    && make build \
    && node apps/prairielearn/dist/server.js --migrate-and-exit \
    && su postgres -c "createuser -s root" \
    && /PrairieLearn/docker/start_postgres.sh stop \
    && /PrairieLearn/docker/gen_ssl.sh \
    && git config --global user.email "dev@illinois.edu" \
    && git config --global user.name "Dev User" \
    && git config --global safe.directory '*'

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
