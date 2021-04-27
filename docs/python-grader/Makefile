# This should be run inside the centos-plbase container
# Your mileage may vary if you are running this locally

SPHINXOPTS    ?= -c sphinx-config
SPHINXBUILD   ?= python3 /usr/local/lib64/python3.6/site-packages/sphinx/cmd/build.py
SOURCEDIR     = ../../graders/python/python_autograder
BUILDDIR      = sphinx-docs

all:
	@$(SPHINXBUILD) -M markdown "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)
	sed 's/\\\*/\*/g' sphinx-docs/markdown/index.md > sphinx-docs.md
	rm -rf sphinx-docs
