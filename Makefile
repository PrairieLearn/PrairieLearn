export PATH := $(CURDIR)/.venv/bin:$(PATH)
export TURBO_NO_UPDATE_NOTIFIER := 1

# On macOS, set flags for pygraphviz to find graphviz headers
# See https://github.com/pygraphviz/pygraphviz/blob/main/INSTALL.txt
ifeq ($(shell uname -s),Darwin)
export CFLAGS := -I$(shell brew --prefix graphviz)/include
export LDFLAGS := -L$(shell brew --prefix graphviz)/lib
endif

.PHONY: build

build:
	@yarn turbo run build --output-logs=errors-only
build-verbose:
	@yarn turbo run build
build-sequential:
	@yarn turbo run --concurrency 1 build

# Note the `--compile-bytecode` flag, which is needed to ensure fast
# performance the first time things run:
# https://docs.astral.sh/uv/guides/integration/docker/#compiling-bytecode
python-deps-core:
	@uv sync --no-default-groups --compile-bytecode
python-deps-docs:
	@uv sync --only-group docs --compile-bytecode
python-deps-dev:
	@uv sync --only-group dev --compile-bytecode
python-deps:
	@uv sync --compile-bytecode

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

dev: start-support python-deps
	@yarn dev
dev-vite: start-support python-deps
	@yarn dev-vite
dev-bun: python-deps
	@yarn dev-bun
dev-workspace-host: start-support
	@yarn dev-workspace-host
dev-all:
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
	@uv run pytest
	@uv run coverage xml -o ./apps/prairielearn/python/coverage.xml
test-prairielearn: start-support
	@yarn workspace @prairielearn/prairielearn run test
test-e2e: start-support
	@yarn workspace @prairielearn/prairielearn run test:e2e

fix-dependencies:
	@yarn knip  -c .knip.ts --fix --fix-type exports --fix-type types --fix-type dependencies
lint-dependencies:
	@yarn knip -c .knip.ts
	@yarn depcruise apps/*/src apps/*/assets packages/*/src

check-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts check
compile-badge-colors:
	@npx sass --no-source-map apps/prairielearn/public/stylesheets/colors.scss apps/prairielearn/public/stylesheets/colors.css
	@yarn prettier --write apps/prairielearn/public/stylesheets/colors.css
check-badge-contrast:
	@node scripts/check-badge-contrast.mjs
check-npm-packages:
	@node scripts/check-npm-packages.mjs
update-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts && yarn prettier --write "apps/prairielearn/src/schemas/**/*.json" && yarn prettier --write "docs/assets/*.schema.json"

# Runs additional third-party linters
lint-all: lint-js lint-python lint-html lint-mustache lint-docs lint-docker lint-actions lint-shell lint-sql-migrations lint-sql

lint: lint-js lint-python lint-html lint-links lint-changeset
lint-js:
	@yarn eslint "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}" --check
# Separate target since the caches don't respect updates to plugins.
# Split into two passes: the first pass lints the type-aware files without a cache (see `typeAwareFiles` in eslint.config.mjs), and the second
# pass lints the non-type-aware files with a cache. We check apps/prairielearn first since it is more likely to have lint errors.
# Keep the Prettier cache locations split too: each Prettier run reconciles all entries in its cache, even entries outside the current glob.
lint-js-cached:
	@yarn eslint "apps/prairielearn/**/*.{ts,tsx}"
	@yarn prettier "apps/prairielearn/**/*.{ts,tsx}" --check --cache --cache-strategy content --cache-location node_modules/.cache/prettier/apps-prairielearn-tsx
	@yarn eslint --cache --cache-strategy content \
		--ignore-pattern "apps/prairielearn/**/*.{ts,tsx}" \
		"**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier \
		"**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}" \
		"!apps/prairielearn/**/*.{ts,tsx}" \
		--check --cache --cache-strategy content --cache-location node_modules/.cache/prettier/non-apps-prairielearn-tsx
lint-python:
	@uv run ruff check ./
	@uv run ruff format --check ./
lint-docs-links: build-docs
	@yarn linkinator ./site | python3 scripts/process_linkinator_output.py
# Lint HTML files, and the build output of the docs
lint-html:
	@yarn htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html" "site"
lint-mustache:
	@yarn htmlmustache check
	@yarn htmlmustache format --check
lint-markdown:
	@yarn markdownlint-cli2
lint-links:
	@node scripts/validate-links.mjs
lint-docker:
	@hadolint ./graders/**/Dockerfile ./workspaces/**/Dockerfile ./images/**/Dockerfile Dockerfile
lint-shell:
	@shellcheck -S warning $(shell find . -type f -name "*.sh" ! -path "./node_modules/*" ! -path "./.venv/*" ! -path "./testCourse/*")
lint-sql:
	@uv run sqlfluff lint
lint-sql-migrations:
	@uv run squawk apps/prairielearn/src/migrations/*.sql
lint-actions:
	@actionlint
lint-changeset:
	@yarn changeset status

# Runs additional third-party formatters
format-all: format-js format-python format-sql format-mustache

format: format-js format-python
format-sql:
	@uv run sqlfluff fix

fix-js:
	@yarn eslint --ext js --fix "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"
	@yarn prettier --write "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"
# This is a separate target since the caches don't respect updates to plugins.
fix-js-cached:
	@yarn prettier --write --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"
	@yarn eslint --ext js --fix --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,html,mustache}"

format-js:
	@yarn prettier --write "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"
format-js-cached:
	@yarn prettier --write --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"

format-mustache:
	@yarn htmlmustache format --write

format-python:
	@uv run ruff check --fix ./
	@uv run ruff format ./

format-changed:
	@node scripts/format-changed.mjs

typecheck: typecheck-js typecheck-python typecheck-contrib typecheck-scripts typecheck-sql
typecheck-contrib:
	@yarn tsgo -p contrib --noEmit
typecheck-scripts:
	@yarn tsgo -p scripts --noEmit
typecheck-js:
	@yarn turbo run build --output-logs=errors-only
typecheck-python: python-deps
	@yarn pyright
typecheck-sql:
	@yarn postgres-language-server check .

changeset:
	@yarn changeset
	@yarn prettier --write ".changeset/**/*.md"

lint-docs: lint-d2 lint-links lint-markdown lint-docs-links

build-docs:
	@NO_MKDOCS_2_WARNING=1 DISABLE_MKDOCS_2_WARNING=true uv run mkdocs build --strict
dev-docs:
	@NO_MKDOCS_2_WARNING=1 DISABLE_MKDOCS_2_WARNING=true uv run mkdocs serve --livereload

format-d2:
	@d2 fmt docs/**/*.d2
lint-d2:
	@d2 fmt --check docs/**/*.d2


dangerous-drop-all-dbs:
	@echo "Dropping all databases matching 'prairielearn_%'..."
	@psql -h localhost -U postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'prairielearn_%'" | while read db; do \
		echo "Dropping $$db"; \
		psql -h localhost -U postgres -c "DROP DATABASE \"$$db\""; \
	done

ci: lint typecheck lint-dependencies test
