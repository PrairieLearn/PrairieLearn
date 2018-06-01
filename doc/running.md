
# Running PrairieLearn

Running PrairieLearn on your own machine is the easiest and best way to get started with developing course content. PrairieLearn supports several different ways of running on your own machine; these are outlined below.

## Running the PrairieLearn docker image

**This is the recommended method** for all users who don't need to develop or test [externally-graded questions](externalGrading.md). This runs PrairieLearn inside a pre-built Docker image that includes all the code and dependencies needed to run PrairieLearn.

If you already have Docker installed, you can get started easily:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn
```

You can then access PrairieLearn by going to [http://localhost:3000/pl](http://localhost:3000/pl).

Please visit [the instructions](running-docker.md) for more information, including how to use your own course content inside this container.


## Running PrairieLearn + PrairieGrader with `docker-compose`

If you need to develop or test [externally-graded questions](externalGrading.md), you should use this method of running PrairieLearn. This method will spin up PrairieLearn, PrairieGrader, and several other services, and ensure they are connected properly to enable external grading to work.

If you've cloned the [PrairieLearn GitHub repo](https://github.com/PrairieLearn/PrairieLearn) and have Docker installed, you can get started easily:

```sh
docker-compose up
```

You can then access PrairieLearn by going to [http://localhost:3000/pl](http://localhost:3000/pl).

Please visit [the instructions](running-docker-compose.md) for more information, including how to use your own course content inside this container.


## Other methods

These methods are for more advanced users, or people who want to develop PrairieLearn itself. Most users will not need these.

#### Running the PrairieLearn docker image with local source code

If you want to develop PrairieLearn itself (for instance, add a feature or fix a bug), you'll need to clone the PrairieLearn repository so that you can edit the source code. You can then mount the source code into the PrairieLearn docker container. This gives you the best of both Docker and local development: the Docker container will pick up any changes you make to the source code without having to rebuild the image, but you can still take advantage of the isolation and included dependencies provided by the Docker container.

Please visit [the instructions](running-local.md) for more information.

#### Running PrairieLearn natively

You can also run PrairieLearn entirely without Docker. When developing PrairieLearn itself, this can be faster than running in Docker. However, it's recommend that you only use this method as a last resort, and only if you know what you're doing! Please visit [the instructions](running-native.md) for more information.
