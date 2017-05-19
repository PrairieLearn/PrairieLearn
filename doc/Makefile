
.PHONY: all
all: models.pdf models.png simplified-models.pdf simplified-models.png high-level.pdf high-level.png

%.png: %.pdf
	convert -density 300 $< $@

%.pdf: %.gv
	dot -Tpdf $< > $@

clean:
	rm -rf models.{pdf,png,eps} simplified-models.{pdf,png,eps} high-level.{pdf,png,eps}
