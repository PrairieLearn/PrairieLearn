
# Docker

## Building the container

In the base `PrairieLearn` directory run:

    docker build -t prairielearn .

## Running the container

To use the build-in example course, run:

    docker run -it -p 3000:3000 prairielearn

To use a local course in the `~/git/pl-tam212` directory, run:

    docker run -it -p 3000:3000 -v ~/git/pl-tam212:/course prairielearn
