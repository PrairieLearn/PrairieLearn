
# Running with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

* First install the Docker version of PrairieLearn as described in the [Docker instructions](running-docker.md).

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js packages:

```sh
cd PrairieLearn
npm install
```

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
docker run -it --rm -p 3000:3000 -v /path/to/course:/course prairielearn/prairielearn COMMAND
```

This can be used to, e.g., run scripts distributed with PrairieLearn.
