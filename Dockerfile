FROM prairielearn/plbase

ENV PATH="/PrairieLearn/node_modules/.bin:$PATH"

# # Install NodeJS dependencies before copying code to take advantage of
# # Docker's layer caching.
# #
# # Unfortunately, Docker's `COPY` command does not support globbing, so we have
# # to indivually copy each `package.json` file. The `tools/validate-dockerfile.mjs`
# # script will run during CI to ensure that all `package.json` files are copied.

# # Copy the directory that contains the Yarn executable.
# COPY .yarn/ /PrairieLearn/.yarn/

# # Special case: copy the entire `bind-mount` package, not just `package.json`,
# # because this package has a native component that needs to be built.
# COPY packages/bind-mount/ /PrairieLearn/packages/bind-mount/

# # Copy packages first; they should generally change less often. Keep this section alphabetized.
# COPY packages/aws-imds/package.json /PrairieLearn/packages/aws-imds/package.json
# COPY packages/compiled-assets/package.json /PrairieLearn/packages/compiled-assets/package.json
# COPY packages/config/package.json /PrairieLearn/packages/config/package.json
# COPY packages/csv/package.json /PrairieLearn/packages/csv/package.json
# COPY packages/docker-utils/package.json /PrairieLearn/packages/docker-utils/package.json
# COPY packages/error/package.json /PrairieLearn/packages/error/package.json
# COPY packages/html/package.json /PrairieLearn/packages/html/package.json
# COPY packages/html-ejs/package.json /PrairieLearn/packages/html-ejs/package.json
# COPY packages/logger/package.json /PrairieLearn/packages/logger/package.json
# COPY packages/migrations/package.json /PrairieLearn/packages/migrations/package.json
# COPY packages/named-locks/package.json /PrairieLearn/packages/named-locks/package.json
# COPY packages/opentelemetry/package.json /PrairieLearn/packages/opentelemetry/package.json
# COPY packages/path-utils/package.json /PrairieLearn/packages/path-utils/package.json
# COPY packages/postgres/package.json /PrairieLearn/packages/postgres/package.json
# COPY packages/postgres-tools/package.json /PrairieLearn/packages/postgres-tools/package.json
# COPY packages/prettier-plugin-sql/package.json /PrairieLearn/packages/prettier-plugin-sql/package.json
# COPY packages/sanitize/package.json /PrairieLearn/packages/sanitize/package.json
# COPY packages/sentry/package.json /PrairieLearn/packages/sentry/package.json
# COPY packages/signed-token/package.json /PrairieLearn/packages/signed-token/package.json
# COPY packages/tsconfig/package.json /PrairieLearn/packages/tsconfig/package.json
# COPY packages/workspace-utils/package.json /PrairieLearn/packages/workspace-utils/package.json

# # Copy apps and the root files.
# COPY apps/grader-host/package.json /PrairieLearn/apps/grader-host/package.json
# COPY apps/workspace-host/package.json /PrairieLearn/apps/workspace-host/package.json
# COPY package.json yarn.lock .yarnrc.yml /PrairieLearn/

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
    && node server.js --migrate-and-exit \
    && su postgres -c "createuser -s root" \
    && /PrairieLearn/docker/start_postgres.sh stop \
    && /PrairieLearn/docker/gen_ssl.sh \
    && git config --global user.email "dev@illinois.edu" \
    && git config --global user.name "Dev User"

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD /PrairieLearn/docker/init.sh
