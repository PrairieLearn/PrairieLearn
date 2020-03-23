
# Installing with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

* First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js packages:

```sh
cd PrairieLearn
npm ci
```

If you don't have `npm` installed on your computer, you can use the version that comes pre-installed in the Docker image:

```sh
docker run -it -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /usr/local/bin/npm ci
```

The path `/path/to/PrairieLearn` should be replaced with the *absolute* path to the PrairieLearn source on your computer.  If your terminal is currently in this folder, you can replace this with `` `pwd` `` to auto-fill the path.

* Create the file `PrairieLearn/config.json`:

```json
{
    "courseDirs": [
        "exampleCourse"
    ]
}
```

* Run it with:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```

### Running Commands in Docker

If needed, you can run the container with a different command:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn COMMAND
```

This can be used to, e.g., run scripts distributed with PrairieLearn.

#### Development from the shell

When making local changes to server-side code, it is faster to restart only the node server instead of the whole docker container.  This can be done by starting the container into a shell environment and starting the server manually:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash
/PrairieLearn/docker/init.sh
```

Then when you make any changes to the server, you can close it `<ctrl-C>` and re-run the init script to see those changes:

```sh
/PrairieLearn/docker/init.sh
```