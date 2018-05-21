# Getting started

* [Windows](#windows)
* [macOS](#macos)
* [Linux](#linux)

Follow the instructions for the OS you're running on. These instructions are meant to make it as easy as possible to get up and running with PrairieLearn. For people working on PrairieLearn itself and not just course content, you'll want to check out the more complete [installation guide](installing.md).

## Windows

1. Install [Docker Community Edition for Windows](https://store.docker.com/editions/community/docker-ce-desktop-windows), which requires Windows 10 Pro/Edu. You should install this if at all possible because it is much better than the older "Docker Toolbox".
    - UIUC students and staff can download Windows 10 from [the WebStore](https://webstore.illinois.edu/).
2. Do some things
3. Profit!

## macOS

1. Install [Docker Community Edition](https://store.docker.com/search?type=edition&offering=community).
2. [Click here](scripts/prairielearn.tar.gz) to download an archive containing the PrairieLearn start script.
3. In Finder, navigate to the downloaded archive and double-click it to extract the `prairielearn.sh` file.
4. Control-click the `prairielearn.sh` file and select `Open in -> Text Edit`.
5. Determine the absolute path to your course directory.
    - If you use GitHub Desktop to manage your course, your course will likely be in a directory like `/Users/mwest/Document/GitHub/pl-tam212`. Be sure to substitute your username for `mwest` and your course respository name for `pl-tam212`.
    - If you typically use git from the command line, you can navigate to your course directory in a terminal and run `pwd` to find that path.
6. Edit the `COURSE_DIR` variable near the top of the file to contain that path. For example:

        COURSE_DIR="Users/mwest/git/pl-tam212"

7. Double-click on the downloaded file to start the PrairieLearn server. A terminal window will open; wait until you see `"Go to http://localhost:3000"`.
8. Leave the terminal window open and visit `http://localhost:3000` in your browser.
10. When you are done with PrairieLearn, close the terminal window to shut down the server.

## Linux

As distributions of Linux vary, these instructions aren't as specific as those for macOS. They assume familiarity with the terminal.

1. Install [Docker Community Edition](https://store.docker.com/search?type=edition&offering=community).
2. [Click here](scripts/prairielearn.tar.gz) to download an archive containing the PrairieLearn start script.
3. Extract the contents to a location of your choosing and open `prairielearn.sh` in a text editor.
4. Determine the absolute path to your course directory and edit the `COURSE_DIR` variable near the top of the file to contain that path. For example:

        COURSE_DIR="home/mwest/git/pl-tam212"

5. Open a terminal and navigate to the location of the downloaded file.
6. Run `./prairielearn.sh` to start the server; wait until you see `"Go to http://localhost:3000"`.
7. Leave the terminal window open and visit `http://localhost:3000` in your browser.
8. When you are done with PrairieLearn, close the terminal window to shut down the server.
