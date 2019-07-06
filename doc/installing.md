
# Installing and running PrairieLearn

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

If you plan on running externally graded questions in local development, please see [this section](../externalGrading/#running-locally-on-docker) for a slightly different docker launch command.

## Upgrading your Docker's version of PrairieLearn

To obtain the latest version of PrairieLearn at any time, make sure PrairieLearn is not running (Ctrl-C it if needed) and then run:

```sh
docker pull prairielearn/prairielearn
```

After this, run PrairieLearn using the same commands as above.

## Running a specific older version of PrairieLearn

The commands above will always run the very latest version of PrairieLearn, which might be an unreleased development version.

The list of available versions is viewable on the [hub.docker build page](https://hub.docker.com/r/prairielearn/prairielearn/builds/).

To run a specific older version (e.g., version 1.2.3) then you can do:

```sh
docker run -it --rm -p 3000:3000 [other args] prairielearn/prairielearn:1.2.3
```
