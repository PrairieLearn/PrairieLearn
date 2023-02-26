# Installing PL for local development

This page describes the procedure to install and run your course locally within Docker. You can develop course content locally following the instructions below, or using the
[in-browser tools](getStarted.md).

- Step 1: Install [Docker Community Edition](https://www.docker.com/community-edition). It's free.

  - On Linux and MacOS this is straightforward. [Download from here](https://store.docker.com/search?type=edition&offering=community).
  - On Windows the best version is [Docker Community Edition for Windows](https://store.docker.com/editions/community/docker-ce-desktop-windows), which requires Windows 10 Pro/Edu.
    - UIUC students and staff can download Windows 10 from [the WebStore](https://webstore.illinois.edu/shop/product.aspx?zpid=2899).
    - Docker Toolbox is no longer supported.

- Step 2: Run PrairieLearn using the example course with:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn
```

- Step 3: Open a web browser and connect to [http://localhost:3000/pl](http://localhost:3000/pl)

- Step 4: When you are finished with PrairieLearn, type Control-C on the commandline where you ran the server to stop it.

- Step 5: To use your own course, use the `-v` flag to bind the Docker `/course` directory with your own course directory (replace the precise path with your own) on Windows:

```sh
docker run -it --rm -p 3000:3000 -v C:\GitHub\pl-tam212:/course prairielearn/prairielearn
```

or on MacOS/Linux:

```sh
docker run -it --rm -p 3000:3000 -v /Users/mwest/git/pl-tam212:/course prairielearn/prairielearn
```

If you are using Docker for Windows then you will need to first give Docker permission to access the C: drive (or whichever drive your course directory is on). This can be done by right-clicking on the Docker "whale" icon in the taskbar, choosing "Settings", and granting shared access to the C: drive.

To use multiple courses, add additional `-v` flags (e.g., `-v /path/to/course:/course -v /path/to/course2:course2`). There are nine available mount points in the Docker: `/course`, `/course2`, `/course3`, ..., `/course9`.

If you're in the root of your course directory already, you can substitute `%cd%` (on Windows) or `$PWD` (Linux and MacOS) for `/path/to/course`.

If you plan on running externally graded questions in local development, please see [this section](../externalGrading/#running-locally-on-docker) for a slightly different docker launch command.

**NOTE**: On MacOS with "Apple Silicon" (ARM64) hardware, the use of R is not currently supported.

## Upgrading your Docker's version of PrairieLearn

To obtain the latest version of PrairieLearn at any time, make sure PrairieLearn is not running (Ctrl-C it if needed) and then run:

```sh
docker pull prairielearn/prairielearn
```

After this, run PrairieLearn using the same commands as above.

## Running a specific version of PrairieLearn

The commands above will always run the very latest version of PrairieLearn, which might be an unreleased development version. If you would like to run the version that is currently deployed, use the appropriate tag for the server you're using:

- For courses running under https://us.prairielearn.com/ use the tag `us-prod-live`;
- For courses running under https://ca.prairielearn.com/ use the tag `ca-live`;
- For institutions with local installations of PrairieLearn, consult your local IT department.

```sh
docker run -it --rm -p 3000:3000 --pull=always [other args] prairielearn/prairielearn:us-prod-live
```

Note that the command above uses the `--pull=always` option, which will update the local version of the image every time the docker command is restarted. If you keep a long-running container locally, make sure to restart the container when updates in the production servers are announced in the [PrairieLearn GitHub Discussions page](https://github.com/PrairieLearn/PrairieLearn/discussions/categories/announcements).

Additional tags are available for older versions. The list of available versions is viewable on the [Docker Hub build page](https://hub.docker.com/r/prairielearn/prairielearn/builds/).

## Running PrairieLearn from a WSL2 instance

If you are using Windows with WSL2, you should be able to run Docker from another WSL2 instance. In order to that, you need to follow these instructions:

- Open the Docker Dashboard, and click on Settings (the gear button at the top of the interface).

  - Under General, ensure the "Use the WSL2 based engine" option is selected.
  - Then, under Resources, select "WSL integration", and enable the option "Enable integration with my default WSL distro".
  - Also enable integration with any listed distros that you want to access docker from.
  - Click on "Apply & Restart" for the settings to apply.

- On the shell of your WSL2 instance, make sure the instance has the `docker` command installed. The installation process may depend on your distribution, but most distributions provide a `docker` package.

- Now you should be able to start PrairieLearn with the following command (assuming your course is stored under `/mnt/c/Users/yourname/git/pl-tam212`):

```sh
docker run -it --rm -p 3000:3000 -v /mnt/c/Users/yourname/git/pl-tam212:/course prairielearn/prairielearn
```

If you plan on running externally graded questions or workspaces in local development, please see the [docker section in the external grading docs](../externalGrading/#running-locally-on-docker) for a slightly different docker launch command.
