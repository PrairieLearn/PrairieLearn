PATH := node_modules/.bin/:$(PATH)

start:
	node index.js

test: NODE_ENV=test
test:
	jest

lint:
	eslint --ext js "**/*.js"
