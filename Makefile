export PATH := $(CURDIR)/.venv/bin:$(PATH)

# On macOS, set flags for pygraphviz to find graphviz headers
ifeq ($(shell uname -s),Darwin)
export CFLAGS := -I$(shell brew --prefix graphviz)/include
export LDFLAGS := -L$(shell brew --prefix graphviz)/lib
endif

build:
	@yarn turbo run build
build-sequential:
	@yarn turbo run --concurrency 1 build

# Note the `--compile-bytecode` flag, which is needed to ensure fast
# performance the first time things run:
# https://docs.astral.sh/uv/guides/integration/docker/#compiling-bytecode
#
# uv sync automatically creates a venv at .venv if it doesn't exist, using
# the Python version specified in pyproject.toml
python-deps-core:
	@uv sync --compile-bytecode
python-deps-docs:
	@uv sync --group docs --compile-bytecode
python-deps-dev:
	@uv sync --group dev --compile-bytecode
python-deps:
	@uv sync --group docs --group dev --compile-bytecode

# Legacy target for backwards compatibility - just runs python-deps-core now
venv-setup: python-deps-core

# This is a separate target since we can't currently install the necessary
# browsers in the development Docker image.
e2e-deps:
	@yarn playwright install chromium --with-deps

deps:
	@yarn
	@$(MAKE) python-deps build

migrate:
	@yarn migrate
migrate-dev:
	@yarn migrate-dev

refresh-workspace-hosts:
	@yarn refresh-workspace-hosts
refresh-workspace-hosts-dev:
	@yarn refresh-workspace-hosts-dev

dev: start-support
	@yarn dev
dev-vite: start-support
	@yarn dev-vite
dev-bun:
	@yarn dev-bun
dev-workspace-host: start-support
	@yarn dev-workspace-host
dev-all: start-support
	@$(MAKE) -s -j2 dev dev-workspace-host

start: start-support
	@yarn start
start-workspace-host: start-support
	@yarn start-workspace-host
start-executor:
	@node apps/prairielearn/dist/executor.js
start-all: start-support
	@$(MAKE) -s -j2 start start-workspace-host

update-database-description:
	@yarn workspace @prairielearn/prairielearn pg-describe postgres -o ../../database

start-support: start-postgres start-redis start-s3rver
start-postgres:
	@scripts/start_postgres.sh
start-redis:
	@scripts/start_redis.sh
start-s3rver:
	@scripts/start_s3rver.sh

# Runs additional tests that may not work in the container.
test-all: test-js test-python test-e2e

test: test-js test-python
test-js: start-support
	@yarn test
test-prairielearn-docker-smoke-tests: start-support
	@yarn workspace @prairielearn/prairielearn run test:docker-smoke-tests
test-prairielearn-dist: start-support build
	@yarn workspace @prairielearn/prairielearn run test:dist
test-python:
	@uv run --group dev pytest
	@uv run --group dev coverage xml -o ./apps/prairielearn/python/coverage.xml
test-prairielearn: start-support
	@yarn workspace @prairielearn/prairielearn run test
test-e2e: start-support
	@yarn workspace @prairielearn/prairielearn run test:e2e

check-dependencies:
	@yarn depcruise apps/*/src apps/*/assets packages/*/src

check-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts check
update-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts && yarn prettier --write "apps/prairielearn/src/schemas/**/*.json" && yarn prettier --write "docs/assets/*.schema.json"

# Runs additional third-party linters
lint-all: lint-js lint-python lint-html lint-docs lint-docker lint-actions lint-shell lint-sql-migrations lint-sql

lint: lint-js lint-python lint-html lint-links lint-changeset
lint-js:
	@yarn eslint "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}" --check
# This is a separate target since the caches don't respect updates to plugins.
lint-js-cached:
	@yarn eslint --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}" --check --cache --cache-strategy content
lint-python:
	@uv run --group dev ruff check ./
	@uv run --group dev ruff format --check ./
# Lint HTML files, and the build output of the docs
lint-html:
	@yarn htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html" "site"
lint-markdown:
	@yarn markdownlint --ignore "**/node_modules/**" --ignore exampleCourse --ignore testCourse --ignore "**/dist/**" "**/*.md"
lint-links:
	@node scripts/validate-links.mjs
lint-docker:
	@hadolint ./graders/**/Dockerfile ./workspaces/**/Dockerfile ./images/**/Dockerfile Dockerfile
lint-shell:
	@shellcheck -S warning $(shell find . -type f -name "*.sh" ! -path "./node_modules/*" ! -path "./.venv/*" ! -path "./testCourse/*")
lint-sql:
	@uv run --group dev sqlfluff lint
lint-sql-migrations:
	@uv run --group dev squawk apps/prairielearn/src/migrations/*.sql
lint-actions:
	@actionlint
lint-changeset:
	@yarn changeset status

# Runs additional third-party formatters
format-all: format-js format-python format-sql

format: format-js format-python
format-sql:
	@uv run --group dev sqlfluff fix

format-js:
	@yarn eslint --ext js --fix "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier --write "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"
# This is a separate target since the caches don't respect updates to plugins.
format-js-cached:
	@yarn eslint --ext js --fix --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier --write --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"

format-python:
	@uv run --group dev ruff check --fix ./
	@uv run --group dev ruff format ./

typecheck: typecheck-js typecheck-python typecheck-contrib typecheck-scripts typecheck-sql
typecheck-contrib:
	@yarn tsgo -p contrib --noEmit
typecheck-scripts:
	@yarn tsgo -p scripts --noEmit
typecheck-js:
	@yarn turbo run build
typecheck-python: python-deps
	@yarn pyright
typecheck-sql:
	@yarn postgres-language-server check .

changeset:
	@yarn changeset
	@yarn prettier --write ".changeset/**/*.md"

lint-docs: lint-d2 lint-links lint-markdown

build-docs:
	@uv run --group docs mkdocs build --strict
dev-docs:
	@uv run --group docs mkdocs serve --livereload

format-d2:
	@d2 fmt docs/**/*.d2

lint-d2:
	@d2 fmt --check docs/**/*.d2


ci: lint typecheck check-dependencies test
