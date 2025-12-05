# syntax=docker/dockerfile-upstream:master-labs

# ==============================================================================
# Build stage: Install Node dependencies and build TypeScript
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /PrairieLearn

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy Yarn configuration and package files
# The `--parents` flag preserves parent directories for the sources.
COPY --parents .yarn/ yarn.lock .yarnrc.yml **/package.json packages/bind-mount/ /PrairieLearn/

# Install Node dependencies.
#
# The `node-gyp` stuff is a workaround to a bug where multiple instances of `node-gyp`
# end up running at the same time and corrupt the Node headers that are being written
# to disk. This is somewhat of a known issue with Yarn and `node-gyp` specifically:
#
# https://github.com/nodejs/node-gyp/issues/1054
# https://github.com/yarnpkg/yarn/issues/1874
#
# By running `node-gyp install` at the beginning, we ensure that the later invocations
# of `node-gyp` will find the headers already installed and not try to install them
# again, thus avoiding the corruption issue.
RUN corepack enable && \
    yarn dlx node-gyp install && \
    yarn install --immutable --inline-builds

# Copy source code (respects .dockerignore)
COPY . .

# Build TypeScript code and clean cache
RUN yarn turbo run build && yarn cache clean

# ==============================================================================
# Final stage: Runtime image with all services
# ==============================================================================
FROM ubuntu:24.04
ARG CACHEBUST=2025-11-15-14-13-19

WORKDIR /PrairieLearn

COPY --parents scripts/pl-install.sh /PrairieLearn/

# Ensures that running Python in the container will use the correct Python version, and that PostgreSQL binaries are available.
ENV PATH="/PrairieLearn/.venv/bin:/PrairieLearn/node_modules/.bin:/usr/lib/postgresql/16/bin:$PATH"

RUN /bin/bash /PrairieLearn/scripts/pl-install.sh

# We copy `pyproject.toml` and the `Makefile` since we need to install Python dependencies.
COPY --parents pyproject.toml Makefile /PrairieLearn/

RUN PIP_NO_CACHE_DIR=1 make python-deps-core

# Copy the rest of the source code (respects .dockerignore)
COPY . .

# Copy built artifacts from the builder stage
# This includes node_modules with native bindings and all dist/ directories
COPY --from=builder /PrairieLearn/node_modules /PrairieLearn/node_modules
COPY --from=builder /PrairieLearn/apps/prairielearn/dist /PrairieLearn/apps/prairielearn/dist
COPY --from=builder /PrairieLearn/apps/prairielearn/public/build /PrairieLearn/apps/prairielearn/public/build
COPY --from=builder /PrairieLearn/apps/grader-host/dist /PrairieLearn/apps/grader-host/dist
COPY --from=builder /PrairieLearn/apps/workspace-host/dist /PrairieLearn/apps/workspace-host/dist
COPY --from=builder /PrairieLearn/packages /PrairieLearn/packages

# set up PrairieLearn and run migrations to initialize the DB
# hadolint ignore=SC3009
RUN chmod +x /PrairieLearn/scripts/init.sh \
    && mkdir /course{,{2..9}} \
    && mkdir -p /workspace_{main,host}_zips \
    && mkdir -p /jobs \
    && /PrairieLearn/scripts/start_postgres.sh \
    && node apps/prairielearn/dist/server.js --migrate-and-exit \
    && su postgres -c "/usr/lib/postgresql/16/bin/createuser -s root" \
    && /PrairieLearn/scripts/start_postgres.sh stop \
    && /PrairieLearn/scripts/gen_ssl.sh \
    && git config --global user.email "dev@example.com" \
    && git config --global user.name "Dev User" \
    && git config --global safe.directory '*'

HEALTHCHECK CMD curl --fail http://localhost:3000/pl/webhooks/ping || exit 1
CMD [ "/PrairieLearn/scripts/init.sh" ]
