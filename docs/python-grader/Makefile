SPHINXOPTS    ?= -c sphinx-config
SPHINXBUILD   ?= sphinx-build
SOURCEDIR     = ../../graders/python/python_autograder
BUILDDIR      = sphinx-docs

all:
	$(SPHINXBUILD) -M markdown "$(SOURCEDIR)" "$(BUILDDIR)" $(SPHINXOPTS) $(O)
	sed 's/\\\*/\*/g' sphinx-docs/markdown/index.md > sphinx-docs.md
	rm -rf sphinx-docs
	yarn prettier --write sphinx-docs.md
