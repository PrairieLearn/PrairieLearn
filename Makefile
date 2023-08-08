build:
	@yarn turbo run build
build-sequential:
	@yarn turbo run --concurrency 1 build
python-deps:
	@python3 -m pip install -r images/plbase/python-requirements.txt --root-user-action=ignore
deps:
	@yarn
	@make python-deps build

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
dev-workspace-host: start-support
	@yarn dev-workspace-host

start: start-support
	@yarn start
start-workspace-host: start-support
	@yarn start-workspace-host
start-executor:
	@node apps/prairielearn/dist/executor.js

update-database-description:
	@yarn --cwd apps/prairielearn pg-describe postgres -o ../../database

start-support: start-postgres start-redis start-s3rver
start-postgres:
	@docker/start_postgres.sh
start-redis:
	@docker/start_redis.sh
start-s3rver:
	@docker/start_s3rver.sh

test: test-js test-python
test-js: start-support
	@yarn turbo run test
test-python:
# `pl_unit_test.py` has an unfortunate file name - it matches the pattern that
# pytest uses to discover tests, but it isn't actually a test file itself. We
# explicitly exclude it here.
	@python3 -m pytest --ignore graders/python/python_autograder/pl_unit_test.py --cov=apps
test-prairielearn: start-support
	@yarn workspace @prairielearn/prairielearn run test

lint: lint-js lint-python lint-html lint-links
lint-js:
	@yarn eslint --ext js --report-unused-disable-directives "**/*.{js,ts}"
	@yarn prettier --check "**/*.{js,ts,mjs,cjs,mts,cts,md,sql,json,yml,html,css}"
lint-python:
	@python3 -m flake8 ./
lint-html:
	@yarn htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html"
lint-links:
	@node tools/validate-links.mjs

format: format-js format-python
format-js:
	@yarn eslint --ext js --fix "**/*.{js,ts}"
	@yarn prettier --write "**/*.{js,ts,mjs,cjs,mts,cts,md,sql,json,yml,html,css}"
format-python:
	@python3 -m isort ./
	@python3 -m black ./

typecheck: typecheck-js typecheck-python
# This is just an alias to our build script, which will perform typechecking
# as a side-effect.
# TODO: Do we want to have a separate typecheck command for all packages/apps?
# Maybe using TypeScript project references?
typecheck-tools:
	@yarn tsc
typecheck-js:
	@yarn turbo run build
typecheck-python:
	@yarn pyright --skipunannotated

changeset:
	@yarn changeset

ci: lint typecheck test
