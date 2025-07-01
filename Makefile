build:
	@yarn turbo run build
build-sequential:
	@yarn turbo run --concurrency 1 build
python-deps:
	@python3 -m pip install -r requirements.txt --root-user-action=ignore
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

test: test-js test-python
test-js: start-support
	@yarn test
test-prairielearn-docker-smoke-tests: start-support
	@yarn workspace @prairielearn/prairielearn run test:docker-smoke-tests
test-prairielearn-dist: start-support build
	@yarn workspace @prairielearn/prairielearn run test:dist
test-python:
	@python3 -m pytest
	@python3 -m coverage xml -o ./apps/prairielearn/python/coverage.xml
test-prairielearn: start-support
	@yarn workspace @prairielearn/prairielearn run test

check-dependencies:
	@yarn depcruise apps/*/src apps/*/assets packages/*/src

check-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts check
update-jsonschema:
	@yarn dlx tsx scripts/gen-jsonschema.mts && yarn prettier --write "apps/prairielearn/src/schemas/**/*.json" && yarn prettier --write "docs/assets/*.schema.json"

# Runs additional third-party linters
lint-all: lint-js lint-python lint-html lint-docs lint-docker lint-actions lint-shell

lint: lint-js lint-python lint-html lint-links
lint-js:
	@yarn eslint "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"
	@yarn prettier "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,html,css,scss,sh}" --check
# This is a separate target since the caches don't respect updates to plugins.
lint-js-cached:
	@yarn eslint --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"
	@yarn prettier "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,html,css,scss,sh}" --check --cache --cache-strategy content
lint-python:
	@python3 -m ruff check ./
	@python3 -m ruff format --check ./
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
lint-actions:
	@actionlint

format: format-js format-python
format-js:
	@yarn eslint --ext js --fix "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"
	@yarn prettier --write "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"
# This is a separate target since the caches don't respect updates to plugins.
format-js-cached:
	@yarn eslint --ext js --fix --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"
	@yarn prettier --write --cache --cache-strategy content "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,md,sql,json,yml,toml,html,css,scss,sh}"

format-python:
	@python3 -m ruff check --fix ./
	@python3 -m ruff format ./

typecheck: typecheck-js typecheck-python typecheck-contrib typecheck-scripts
typecheck-contrib:
	@yarn tsc -p contrib
typecheck-scripts:
	@yarn tsc -p scripts
typecheck-js:
	@yarn turbo run build
typecheck-python:
	@yarn pyright

changeset:
	@yarn changeset
	@yarn prettier --write ".changeset/**/*.md"

lint-docs: lint-d2 lint-links lint-markdown

prepare-docs-venv:
	@if uv --version >/dev/null 2>&1; then \
		uv venv --python-preference only-system /tmp/pldocs/venv; \
		uv pip install -r docs/requirements.txt --python /tmp/pldocs/venv; \
	else \
		python3 -m venv /tmp/pldocs/venv; \
		/tmp/pldocs/venv/bin/python3 -m pip install -r docs/requirements.txt; \
	fi
build-docs: prepare-docs-venv
	@/tmp/pldocs/venv/bin/mkdocs build --strict
preview-docs: prepare-docs-venv
	@/tmp/pldocs/venv/bin/mkdocs serve

format-d2:
	@d2 fmt docs/**/*.d2

lint-d2:
	@d2 fmt --check docs/**/*.d2


ci: lint typecheck check-dependencies test
