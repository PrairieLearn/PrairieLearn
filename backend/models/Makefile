
.PHONY: all
all: models.pdf models.png

%.png: %.pdf
	convert -density 300 $< $@

%.pdf: %.gv
	dot -Tpdf $< > $@

clean:
	rm -rf models.{pdf,png,eps}
