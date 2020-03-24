
# Installing with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

* First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js packages.  This will use the version of `npm` that is pre-installed in the Docker image, so you don't need your own copy installed.

```sh
docker run -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /usr/local/bin/npm ci
```

The path `/path/to/PrairieLearn` should be replaced with the *absolute* path to the PrairieLearn source on your computer.  If you're in the root of the source directory already, you can substitute `%cd%` (on Windows) or `$PWD` (Linux and MacOS) for `/path/to/PrairieLearn`.

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

This can be used to, e.g., run scripts distributed with PrairieLearn by opening a bash shell:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash
```

### Server from shell

When making local changes to server-side code, it is faster to restart only the node server instead of the whole docker container.  This can be done by starting the server manually from a shell instance, then restarting the server when changes are made.

```sh
/PrairieLearn/docker/init.sh
```

Then when any modifications are made, you can close the server with `<ctrl-C>` and re-run the init script.

### Tests from shell

The linters and tests for the Python and JavaScript code can be run with the following commands in a shell instance:

```sh
cd /PrairieLearn
./docker/start_postgres.sh
./docker/lint_js.sh
./docker/lint_python.sh
./docker/test_js.sh
./docker/test_python.sh
```
