FROM amazonlinux:2023.12.20260930.0
ARG CACHEBUST=2026-10-22-11-58-28

WORKDIR /PrairieLearn

COPY --parents scripts/pl-install.sh /PrairieLearn/

RUN /bin/bash /PrairieLearn/scripts/pl-install.sh

# Ensure that running Python in the container will use the correct Python version.
ENV PATH="/PrairieLearn/.venv/bin:/PrairieLearn/node_modules/.bin:$PATH"

# - Ensure that all `uv` commands compile Python source files to bytecode.
# - Ensure that all `uv` commands do not use any caching.
ENV UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1

# Build native Node addons against the headers that ship with Node instead of
# having node-gyp download a second copy into `~/.cache/node-gyp`.
ENV npm_config_nodedir=/nvm/current

# We copy `pyproject.toml` and the `Makefile` since we need to install Python dependencies.
COPY --parents pyproject.toml Makefile /PrairieLearn/

# The test suites bundled with the largest Python packages account for ~160 MB
# and are never imported at runtime.
RUN make python-deps-core \
    && for pkg in matplotlib networkx numpy pandas pyarrow scipy sklearn statsmodels sympy; do \
        find .venv/lib/python3.*/site-packages/"$pkg" -type d -name tests -prune -exec rm -rf {} + || exit 1; \
    done

# This copies in all the `package.json` files in `apps` and `packages`, which
# pnpm needs to correctly install all dependencies in our workspaces.
#
# We also need to copy the `pnpm-workspace.yaml` file, which is necessary for
# pnpm to correctly install dependencies.
#
# Finally, we copy `packages/bind-mount/` since this package contains native
# code that will be built during the install process.
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml package.json apps/*/package.json packages/*/package.json packages/bind-mount/ packages/*/bin/ /PrairieLearn/

# Pruning clears registry metadata outside the package store. Remove both
# caches in this layer so they do not add to the final image.
RUN pnpm install --frozen-lockfile \
    && pnpm store prune \
    && rm -rf "$(pnpm store path)"

# NOTE: Modify .dockerignore to allowlist files/directories to copy.
COPY . .

# set up PrairieLearn and run migrations to initialize the DB
# hadolint ignore=SC3009
RUN chmod +x /PrairieLearn/scripts/init.sh \
    && mkdir /course{,{2..9}} \
    && mkdir -p /workspace_{main,host}_zips \
    && mkdir -p /jobs \
    && /PrairieLearn/scripts/start_postgres.sh \
    && make build \
    && rm -rf /PrairieLearn/.turbo \
    && node apps/prairielearn/dist/server.js --migrate-and-exit \
    && /PrairieLearn/scripts/start_postgres.sh stop \
    && /PrairieLearn/scripts/gen_ssl.sh \
    && git config --global user.email "dev@example.com" \
    && git config --global user.name "Dev User" \
    && git config --global safe.directory '*'

HEALTHCHECK CMD ["curl", "--fail", "http://localhost:3000/pl/webhooks/ping"]
CMD [ "/PrairieLearn/scripts/init.sh" ]
