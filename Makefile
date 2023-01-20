build:
	@yarn turbo run build
	@node packages/compiled-assets/dist/cli.js build ./assets ./public/build

dev:
	@yarn turbo run dev

start: start-support
	@node server.js
start-nodemon: start-support
	@yarn nodemon server.js
start-workspace-host: start-support kill-running-workspaces
	@node workspace_host/interface.js
start-executor:
	@node executor.js

kill-running-workspaces:
	@docker/kill_running_workspaces.sh

start-support: start-postgres start-redis start-s3rver
start-postgres:
	@docker/start_postgres.sh
start-redis:
	@docker/start_redis.sh
start-s3rver:
	@docker/start_s3rver.sh

test: test-js test-python
test-js: test-prairielearn test-prairielib test-grader-host test-workspace-host test-packages
test-prairielearn: start-support
	@yarn mocha --parallel "tests/**/*.test.{js,mjs}"
test-prairielearn-serial: start-support
	@yarn mocha "tests/**/*.test.{js,mjs}"
test-prairielib:
	@yarn jest prairielib/
test-grader-host:
	@yarn jest grader_host/
test-workspace-host:
	@yarn mocha "workspace_host/**/*.test.{js,mjs}"
test-packages:
	@yarn turbo run test
test-python:
# `pl_unit_test.py` has an unfortunate file name - it matches the pattern that
# pytest uses to discover tests, but it isn't actually a test file itself. We
# explicitly exclude it here.
	@python3 -m pytest --ignore graders/python/python_autograder/pl_unit_test.py

lint: lint-js lint-python lint-html lint-links
lint-js:
	@yarn eslint --ext js --report-unused-disable-directives "**/*.js"
	@yarn prettier --check "**/*.{js,ts,md}"
lint-python:
	@python3 -m flake8 ./
lint-html:
	@yarn htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html"
lint-links:
	@node tools/validate-links.mjs

format: format-js format-python
format-js:
	@yarn eslint --ext js --fix "**/*.js"
	@yarn prettier --write "**/*.{js,ts,md}"
format-python:
	@python3 -m isort ./
	@python3 -m black ./

typecheck: typecheck-js typecheck-python
typecheck-js:
	@yarn tsc
typecheck-python:
	@yarn pyright --skipunannotated

changeset:
	@yarn changeset
