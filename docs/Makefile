# Execute commands regardless of physical state of files
.PHONY: all jsdoc build preview sphinx

# Overall build scheme
all: jsdoc \
	models.pdf \
	models.png \
	simplified-models.pdf \
	simplified-models.png \
	high-level.pdf \
	high-level.png \
	question-flow.pdf \
	question-flow.png \
	build

# Generate the documentation for the JavaScript components
# For details, see: http://usejsdoc.org/about-getting-started.html
jsdoc:
	../node_modules/.bin/jsdoc -c jsdoc-config.json

# The mkdocs commands have to be on the same directory level as the mkdocs.yml
# Thus, we jump one directory up and then run the command.
# For details, see: https://github.com/mkdocs/mkdocs/issues/1276
build:
	cd ../ && mkdocs build

preview:
	cd ../ && mkdocs serve

%.png: %.pdf
	convert -density 300 $< $@

%.pdf: %.gv
	dot -Tpdf $< > $@

sphinx:
	make -C python-grader

# Clean up the environment
clean:
	rm -rf \
	models.{pdf,png,eps} \
	simplified-models.{pdf,png,eps} \
	high-level.{pdf,png,eps} \
	question-flow.{pdf,png,eps}
