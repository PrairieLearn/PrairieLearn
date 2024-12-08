# Execute commands regardless of physical state of files
.PHONY: all build preview sphinx

# Overall build scheme
all: build

# The mkdocs commands have to be on the same directory level as the mkdocs.yml
# Thus, we jump one directory up and then run the command.
# For details, see: https://github.com/mkdocs/mkdocs/issues/1276
build:
	cd ../ && mkdocs build

preview:
	cd ../ && mkdocs serve

sphinx:
	make -C python-grader
