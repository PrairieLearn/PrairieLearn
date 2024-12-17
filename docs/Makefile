# Execute commands regardless of physical state of files
.PHONY: all build preview sphinx d2-fmt

# Overall build scheme
all: build

# fmt doesn't check if the formatting changed, it just formats everything
# PR: https://github.com/terrastruct/d2/pull/2253
d2-fmt:
	$(eval OLD_STATE=$(shell find . -name '*.d2' | xargs sha1sum | cut -d ' ' -f 1 | sort | sha1sum | cut -d ' ' -f 1))
	$(eval NEW_STATE=$(shell find . -name '*.d2' | xargs d2 fmt && find . -name '*.d2' | xargs sha1sum | cut -d ' ' -f 1 | sort | sha1sum | cut -d ' ' -f 1))
	@if [ "$(OLD_STATE)" != "$(NEW_STATE)" ]; then \
		echo "Some d2 files were not formatted"; \
		exit 1; \
	fi

# The mkdocs commands have to be on the same directory level as the mkdocs.yml
# Thus, we jump one directory up and then run the command.
# For details, see: https://github.com/mkdocs/mkdocs/issues/1276
build: d2-fmt
	cd ../ && mkdocs build

preview:
	cd ../ && mkdocs serve

sphinx:
	make -C python-grader
