.PHONY: build

build:
	../backend/node_modules/requirejs/bin/r.js -o app.build.js
	rsync -r MathJax ../frontend-build
	cat ../frontend/index.html | awk '{sub(/https:\/\/cdn.mathjax.org\/mathjax\/latest/,"MathJax")}; 1' > ../frontend-build/index.html
	echo 'document.PLVersion={"gitDescribe": "'`git describe --long --abbrev=40 HEAD`'"};' > ../frontend-build/version.js
	cat ../frontend-build/version.js
