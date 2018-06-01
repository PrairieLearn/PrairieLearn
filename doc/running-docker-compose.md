# Running PrairieLearn + PrairieGrader with `docker-compose`

If you need to develop or test [externally-graded questions](externalGrading.md), you should use this method of running PrairieLearn. This method will spin up PrairieLearn, PrairieGrader, and several other services, and ensure they are connected properly to enable external grading to work.

## Instructions

1. Install [Docker Community Edition](https://www.docker.com/community-edition). It's free.
    * On Linux and MacOS this is straightforward. [Download from here](https://store.docker.com/search?type=edition&offering=community).
    * On Windows the best version is [Docker Community Edition for Windows](https://store.docker.com/editions/community/docker-ce-desktop-windows), which requires Windows 10 Pro/Edu. You should install this if at all possible because it is much better than the older "Docker Toolbox".
        * UIUC students and staff can download Windows 10 from [the WebStore](https://webstore.illinois.edu/).

2. Depending on your operating system and the version of Docker you have, you may have to install Docker Compose separately. Visit [https://docs.docker.com/compose/install/](https://docs.docker.com/compose/install/) to determine if this is necessary for you.

3. If you haven't already, clone the [PrairieLearn repository](https://github.com/PrairieLearn/PrairieLearn) to your machine:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

4. Within the `PrairieLearn` directory you just cloned, run

```sh
docker-compose up
```

Note that you may see error messages about connections. It's possible that PrairieLearn or PrairieGrader started up before the RabbitMq or Postgres containers. Wait until you see the error messages stop; this will indicate that everything is now up and running!

You should now be able to access PrairieLearn at [http://localhost:3000/pl](http://localhost:3000/pl).

## Using your own course content

If you have your own course and you'd like to work on it locally, you can mount the course directory into the PrairieLearn container. To do this, specify the `COURSE_DIR` environment variable when running `docker-compose`:

```sh
COURSE_DIR=/absolute/path/to/course/ docker-compose up
```

Note that this must be an absolute path, not a relative one.
