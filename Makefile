#!make

# Include config variables for custom course
include envfile
export $(shell sed 's/=.*//' envfile)

# Execute commands regardless of physical state of files
.PHONY: build-docs build-dev dev dcourse lcourse  pltest lint unit test docs clean node  

# Install node dependencies (requires node > 10.0)
node: 
	npm ci

# Generates a development docker from current directory
build-dev:
	docker build -t pltestlocal .

# Show the development version of the prairielearn
dev: build-dev
	docker run -it --rm -p 3000:3000 pltestlocal

dcourse: build-dev
	docker run -it --rm -p 3000:3000 -v ${COURSE_REPO_PATH}:/course prairielearn/prairielearn

# Show a live version of the prairielearn
live:
	docker run -it --rm -p 3000:3000 prairielearn/prairielearn

lcourse:
	docker run -it --rm -p 3000:3000 -v ${COURSE_REPO_PATH}:/course prairielearn/prairielearn

# Remove the docker container
clean:
	docker stop pltestlocal; docker rm pltestlocal

####### documentation

# These calls rely on the Makefile in the documentation directory

# Build the docs
build-docs:
	cd doc/ && $(MAKE) all

# View the documentation
docs: build-docs
	cd doc/ && $(MAKE) preview

######## Unit Tests

# Test code against the linter settings
lint:
	{ \
	docker run -itd --name=pltestcontainer pltestlocal /bin/bash        ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/lint_js.sh     ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/lint_python.sh ; \
	docker stop pltestcontainer                                         ; \
	docker rm pltestcontainer                                           ; \
	}

# Run prairielearn's unit testing suite	
unit:
	{ \
	docker run -itd --name=pltestcontainer pltestlocal /bin/bash        ; \
	docker exec -it pltestcontainer /PrairieLearn/docker/npm_test.sh    ; \
	docker stop pltestcontainer                                         ; \
	docker rm pltestcontainer                                           ; \
	}

# Test everything
test: lint unit
