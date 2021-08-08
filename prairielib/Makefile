PATH := node_modules/.bin/:$(PATH)

test: NODE_ENV=test
test:
	jest

lint:
	eslint --ext js "**/*.js"
