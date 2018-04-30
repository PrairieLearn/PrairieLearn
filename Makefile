# Execute commands regardless of physical state of files
.PHONY: build-docker run-docker up-docker test-pl test-linters test-all build-docs run-docs up-docs

# Generates a development docker from current directory
build-docker:
	docker build -t pltestlocal .

# Previews the development docker container
run-docker:
	docker run -it --rm -p 3000:3000 pltestlocal

up-docker: 
	build-docker run-docker

# These calls rely on the Makefile in the documentation directory

# Build the documentation
build-docs:
	cd doc/ && $(MAKE) all

# View the documentation
run-docs: 
	cd doc/ && $(MAKE) preview

# Build and view the documentation
up-docs:
	build-docs run-docs


# Test code against the linter settings
test-linters:
	{ \
	docker run -itd --name=pltestcontainer pltestlocal /bin/bash        ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/lint_js.sh     ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/lint_python.sh ; \
	docker stop pltestcontainer                                         ; \
	docker rm pltestcontainer                                           ; \
	}

# Run prairielearn's unit testing suite	
test-pl:
	{ \
	docker run -itd --name=pltestcontainer pltestlocal /bin/bash        ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/npm_test.sh    ; \
	docker stop pltestcontainer                                         ; \
	docker rm pltestcontainer                                           ; \
	}

# Test everything
test-all:
	test-pl test-linters