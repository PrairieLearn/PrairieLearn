
.PHONY: all
all: models.pdf models.png tables.txt

%.png: %.pdf
	convert -density 300 $< $@

%.pdf: %.gv
	dot -Tpdf $< > $@

clean:
	rm -rf models.{pdf,png,eps}

tables.txt: FORCE
	psql -c '\dt' postgres | grep '^ public |' | cut -d '|' -f 2 | xargs -n 1 -I {} psql -c "\d {}" postgres > tables.txt

FORCE:
