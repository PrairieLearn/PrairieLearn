
# Docker

## Building the container

In the base `PrairieLearn` directory run:

    docker build -t prairielearn .

## Running the container

To use the build-in example course, run:

    docker run -it -p 3000:3000 prairielearn

To use a local course in the `~/git/pl-tam212` directory, run:

    docker run -it -p 3000:3000 -v ~/git/pl-tam212:/course prairielearn

## Pushing to Docker Hub

List images:

    docker images

Tag the correct one by ID:

    docker tag 7d9495d03763 prairielearn/prairielearn:latest

Login to Docker Hub:

    docker login

Push the image:

    docker push prairielearn/prairielearn

## Checking a push was successful

Delete all local versions:

    docker rmi -f 7d9495d03763

Pull and run the new version:

    docker run -it -p 3000:3000 -v ~/git/pl-tam212:/course prairielearn/prairielearn
