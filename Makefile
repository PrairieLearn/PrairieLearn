build:
	@pnpm --silent turbo run build
build-sequential:
	@pnpm --silent turbo run --concurrency 1 build
python-deps:
	@python3 -m pip install -r images/plbase/python-requirements.txt --root-user-action=ignore
deps:
	@pnpm install
	@$(MAKE) python-deps build

migrate:
	@pnpm --silent migrate
migrate-dev:
	@pnpm --silent migrate-dev

refresh-workspace-hosts:
	@pnpm --silent refresh-workspace-hosts
refresh-workspace-hosts-dev:
	@pnpm --silent refresh-workspace-hosts-dev

dev: start-support
	@pnpm --silent dev
dev-workspace-host: start-support
	@pnpm --silent dev-workspace-host
dev-all: start-support
	@$(MAKE) -s -j2 dev dev-workspace-host

start: start-support
	@pnpm --silent start
start-workspace-host: start-support
	@pnpm --silent start-workspace-host
start-executor:
	@node apps/prairielearn/dist/executor.js
start-all: start-support
	@$(MAKE) -s -j2 start start-workspace-host

update-database-description:
	@pnpm --silent --filter @prairielearn/prairielearn pg-describe postgres -o ../../database

start-support: start-postgres start-redis start-s3rver
start-postgres:
	@docker/start_postgres.sh
start-redis:
	@docker/start_redis.sh
start-s3rver:
	@docker/start_s3rver.sh

test: test-js test-python
test-js: start-support
	@pnpm --silent turbo run test
test-js-dist: start-support
	@pnpm --silent turbo run test:dist
test-python:
	@python3 -m pytest
test-prairielearn: start-support
	@pnpm --silent --filter @prairielearn/prairielearn run test

check-dependencies:
	@pnpm --silent depcruise apps/*/src apps/*/assets packages/*/src

lint: lint-js lint-python lint-html lint-links
lint-js:
	@pnpm --silent eslint --ext js --report-unused-disable-directives "**/*.{js,ts}"
	@pnpm --silent prettier --check "**/*.{js,ts,mjs,cjs,mts,cts,md,sql,json,yml,html,css}"
lint-python:
	@python3 -m ruff check ./
	@python3 -m ruff format --check ./
lint-html:
	@pnpm --silent htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html"
lint-links:
	@node tools/validate-links.mjs

format: format-js format-python
format-js:
	@pnpm --silent eslint --ext js --fix "**/*.{js,ts}"
	@pnpm --silent prettier --write "**/*.{js,ts,mjs,cjs,mts,cts,md,sql,json,yml,html,css}"
format-python:
	@python3 -m ruff check --fix ./
	@python3 -m ruff format ./

typecheck: typecheck-js typecheck-python
# This is just an alias to our build script, which will perform typechecking
# as a side-effect.
# TODO: Do we want to have a separate typecheck command for all packages/apps?
# Maybe using TypeScript project references?
typecheck-tools:
	@pnpm --silent tsc
typecheck-js:
	@pnpm --silent turbo run build
typecheck-python:
	@pnpm --silent pyright --skipunannotated

changeset:
	@pnpm --silent changeset
	@pnpm --silent prettier --write ".changeset/**/*.md"

ci: lint typecheck check-dependencies test
