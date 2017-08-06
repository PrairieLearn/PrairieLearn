
.PHONY: all
all: jsdoc \
	models.pdf \
	models.png \
	simplified-models.pdf \
	simplified-models.png \
	high-level.pdf \
	high-level.png \
	question-flow.pdf \
	question-flow.png

.PHONY: jsdoc
jsdoc:
	../node_modules/.bin/jsdoc -c jsdoc-config.json

%.png: %.pdf
	convert -density 300 $< $@

%.pdf: %.gv
	dot -Tpdf $< > $@

clean:
	rm -rf \
	models.{pdf,png,eps} \
	simplified-models.{pdf,png,eps} \
	high-level.{pdf,png,eps} \
	question-flow.{pdf,png,eps}
