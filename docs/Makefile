# Execute commands regardless of physical state of files
.PHONY: all build preview d2-fmt

# Overall build scheme
all: build

d2-fmt:
	d2 fmt --check **/*.d2

# The mkdocs commands have to be on the same directory level as the mkdocs.yml
# Thus, we jump one directory up and then run the command.
# For details, see: https://github.com/mkdocs/mkdocs/issues/1276
build: d2-fmt
	cd ../ && mkdocs build

preview:
	cd ../ && mkdocs serve
