.PHONY: build

build:
	../backend/node_modules/requirejs/bin/r.js -o app.build.js
	echo 'document.PLVersion={"gitDescribe": "'`git describe --long --abbrev=40 HEAD`'"};' > ../frontend-build/version.js
	cat ../frontend-build/version.js
