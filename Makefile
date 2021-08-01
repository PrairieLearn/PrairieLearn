PATH := node_modules/.bin/:$(PATH)

start:
	node server.js
start-nodemon:
	nodemon -L server.js
start-s3rver:
	mkdir -p /s3rver
	s3rver --directory /s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store

test:
	nyc --reporter=lcov mocha tests/index.js
test-js: test
test-sync:
	mocha tests/sync/index.js
test-nocoverage:
	mocha tests/index.js
test-python:
	python3 /PrairieLearn/question-servers/freeformPythonLib/prairielearn_test.py

lint: lint-js lint-python
lint-js:
	eslint --ext js "**/*.js"
lint-python:
	python3 -m flake8 ./
typecheck:
	tsc
depcheck:
	-depcheck --ignore-patterns=public/**
	@echo WARNING:
	@echo WARNING: Before removing an unused package, also check that it is not used
	@echo WARNING: by client-side code. Do this by running '"git grep <packagename>"'
	@echo WARNING:
	@echo WARNING: Note that many devDependencies will show up as unused. This is not
	@echo WARNING: a problem.
	@echo WARNING:
