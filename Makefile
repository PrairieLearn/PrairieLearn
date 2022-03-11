export PATH := node_modules/.bin/:$(PATH)

build:
	@turbo run build

dev:
	@turbo run dev

start: start-support
	@node server.js
start-nodemon: start-support
	@nodemon -L server.js
start-workspace-host: start-support kill-running-workspaces
	@node workspace_host/interface.js &

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
test-js: test-prairielearn test-prairielib test-grader-host test-packages
test-prairielearn: start-support
	@nyc --reporter=lcov mocha --full-trace tests/index.js
test-prairielib:
	@jest prairielib/
test-grader-host:
	@jest grader_host/
test-nocoverage: start-support
	@mocha tests/index.js
test-packages:
	@turbo run test
test-python:
# `pl_unit_test.py` has an unfortunate file name - it matches the pattern that
# pytest uses to discover tests, but it isn't actually a test file itself. We
# explicitly exclude it here.
	@python3 -m pytest --ignore graders/python/python_autograder/pl_unit_test.py
	
lint: lint-js lint-python lint-html lint-links
lint-js:
	@eslint --ext js "**/*.js"
	@prettier --check "**/*.{js,ts,md}"
lint-python:
	@python3 -m flake8 ./
lint-html:
	@htmlhint "testCourse/**/question.html" "exampleCourse/**/question.html"
lint-links:
	@node tools/validate-links.mjs

format: format-js
format-js:
	@eslint --ext js --fix "**/*.js"
	@prettier --write "**/*.{js,ts,md}"

typecheck: typecheck-js typecheck-python
typecheck-js:
	@tsc
typecheck-python:
	@pyright

depcheck:
	-depcheck --ignore-patterns=public/**
	@echo WARNING:
	@echo WARNING: Before removing an unused package, also check that it is not used
	@echo WARNING: by client-side code. Do this by running '"git grep <packagename>"'
	@echo WARNING:
	@echo WARNING: Note that many devDependencies will show up as unused. This is not
	@echo WARNING: a problem.
	@echo WARNING:
