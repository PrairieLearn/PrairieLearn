
# Installing and running PrairieLearn v2

## Method 1: Docker with built-in PrairieLearn

This is the easiest way to get started.

1. Install [Docker](https://www.docker.com). Note that on Windows there are several versions of Docker available, depending on which Windows version you have. You might also need to enable virtualization in the BIOS.

1. Run PrairieLearn with:

        docker run -it -p 3000:3000 prairielearn/prairielearn

    This will run the built-in PrairieLearn and access to the Example Course. Type Control-C to stop the PrairieLearn server.

1. Open a web browser and connect to http://localhost:3000/pl

1. To use your own course, point Docker to the correct directory with:

        docker run -it -p 3000:3000 -v /path/to/course:/course prairielearn/prairielearn

    Type Control-C to stop the PrairieLearn server.

## Method 2: Docker with local copy of PrairieLearn

If you want to do development of PrairieLearn itself (not just question writing), then you'll need a local copy of PrairieLearn.

1. Clone PrairieLearn from the main repository:

        git clone https://github.com/PrairieLearn/PrairieLearn.git

1. Run it with:

        docker run --rm -p 3000:3000 -v /path/to/PrairieLearn:/prairielearn prairielearn/prairielearn


## Method 3: Fully local installation

To install PrairieLearn locally you should:

1. Install the pre-requisites:

    * [Node.js](http://nodejs.org/) version 0.12 or higher
    * [npm](https://npmjs.org/) (included with Node.js on Windows)
    * [PostgreSQL](https://www.postgresql.org) version 9.6 or higher
    * command-line git or [GitHub Desktop](https://desktop.github.com)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

  Note that with MacPorts you need to select the active version of PostgreSQL, for example `port select postgresql postgresql95`.

1. Clone the latest code:

        git clone https://github.com/PrairieLearn/PrairieLearn.git

1. Install the backend libraries:

        cd PrairieLearn/v2
        npm install

1. Create the database (one time only):

        initdb -D ~/defaultdb

1. Run the database:

        pg_ctl -D ~/defaultdb -l ~/logfile start

1. Create the file `PrairieLearn/v2/config.json` with the path of your local course repository:

        {
            "courseDirs": [
                "/Users/mwest/git/pl-tam212",
                "exampleCourse"
            ]
        }

1. Run the server:

        cd PrairieLearn/v2
        node server

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with `Crtl-C`.

1. In a web-browswer go to http://localhost:3000/pl
