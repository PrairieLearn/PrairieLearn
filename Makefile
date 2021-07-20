PATH := /PrairieLearn/node_modules/.bin/:$(PATH)

start:
	node server.js
start-nodemon:
	nodemon -L server.js
start-s3rver:
	mkdir -p /s3rver
	s3rver --directory /s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store

test:
	nyc --reporter=lcov mocha tests/index.js
test-sync:
	mocha tests/sync/index.js
test-nocoverage:
	mocha tests/index.js

lint: lint-js lint-python
lint-js:
	eslint --ext js "**/*.js"
lint-python:
	python3 -m flake8 ./
typecheck:
	tsc
depcheck:
	-npx depcheck
	@echo WARNING:
	@echo WARNING: Also check that unused packages are not used by client-side code.
	@echo WARNING: Do this by running '"git grep <packagename>"'
	@echo WARNING:
