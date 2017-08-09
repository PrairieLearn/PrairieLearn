
# Installing and running PrairieLearn

## Method 1: Docker with built-in PrairieLearn

This is the easiest way to get started.

* Step 1: Install [Docker Community Edition](https://www.docker.com/community-edition). It's free. 
    * On Linux and MacOS this is straightforward. [Download from here](https://store.docker.com/search?type=edition&offering=community).
    * On Windows the best version is [Docker Community Edition for Windows](https://store.docker.com/editions/community/docker-ce-desktop-windows), which requires Windows 10 Pro/Edu. You should install this if at all possible because it is much better than the older "Docker Toolbox".
        * UIUC students and staff can download Windows 10 from [the WebStore](https://webstore.illinois.edu/).

* Step 2: Run PrairieLearn using the example course with:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn
```

* Step 3: Open a web browser and connect to [http://localhost:3000/pl](http://localhost:3000/pl)

* Step 4: When you are finished with PrairieLearn, type Control-C on the commandline where your ran the server to stop it.

* Step 5: To use your own course, point Docker to the correct directory (replace the precise path with your own) on Windows:

```sh
docker run -it --rm -p 3000:3000 -v C:\GitHub\pl-tam212:/course prairielearn/prairielearn
```

or on MacOS/Linux:

```sh
docker run -it --rm -p 3000:3000 -v /Users/mwest/git/pl-tam212:/course prairielearn/prairielearn
```

If you are using Docker for Windows then you will need to first give Docker permission to access the C: drive (or whichever drive your course directory is on). This can be done by right-clicking on the Docker "whale" icon in the taskbar, choosing "Settings", and granting shared access to the C: drive.

If you're in the root of your course directory already, you can substitute `%cd%` (on Windows) or `$PWD` (Linux and MacOS) for `/path/to/course`.

### Upgrading your Docker's version of PrairieLearn

To obtain the latest version of PrairieLearn at any time, run:

```sh
docker pull prairielearn/prairielearn
```

After this, run PrairieLearn using the same commands as above.

### Running a specific older version of PrairieLearn

The commands above will always run the very latest version of PrairieLearn, which might be an unreleased development version.

The list of available versions is viewable on the [hub.docker build page](https://hub.docker.com/r/prairielearn/prairielearn/builds/).

To run a specific older version (e.g., version 1.2.3) then you can do:

```sh
docker run -it --rm -p 3000:3000 [other args] prairielearn/prairielearn:1.2.3
```

### Running Commands in Docker

If needed, you can run the container with a different command:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/course:/course prairielearn/prairielearn COMMAND
```

This can be used to, e.g., run scripts distributed with PrairieLearn.

## Method 2: Docker with local copy of PrairieLearn

If you want to do development of PrairieLearn itself (not just question writing), then you'll need a local copy of PrairieLearn.

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js packages:

```sh
cd PrairieLearn
npm install
```

* Run it with:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```


## Method 3: Fully local installation

To install PrairieLearn locally you should:

* Install the pre-requisites:

    * [Node.js](http://nodejs.org/) version 7.3 or higher
    * [npm](https://npmjs.org/) (included with Node.js on Windows)
    * [PostgreSQL](https://www.postgresql.org) version 9.6 or higher
    * command-line git or [GitHub Desktop](https://desktop.github.com)

On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

Note that with MacPorts you need to select the active version of PostgreSQL, for example `port select postgresql postgresql96`.

* Clone the latest code:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the backend libraries:

```sh
cd PrairieLearn
npm install
```

* Create the database (one time only):

```sh
initdb -D ~/defaultdb
```

* Run the database:

```sh
pg_ctl -D ~/defaultdb -l ~/logfile start
```

* Create the file `PrairieLearn/config.json` with the path of your local course repository:

```json
{
    "courseDirs": [
        "/Users/mwest/git/pl-tam212",
        "exampleCourse"
    ]
}
```

* Run the server:

```sh
cd PrairieLearn
node server
```

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with `Crtl-C`.

* In a web-browswer go to [http://localhost:3000/pl](http://localhost:3000/pl)
