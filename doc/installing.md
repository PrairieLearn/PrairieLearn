
# Installing and running PrairieLearn

## Method 1: Docker with built-in PrairieLearn

This is the easiest way to get started.

1. Install [Docker](https://www.docker.com). On Linux and MacOS this is straightforward. On Windows the best version is "Docker for Windows", which require Windows 10 Pro/Edu. You should install this if at all possible because it is much better than the older "Docker Toolbox".

1. Run PrairieLearn with:

        docker run -it --rm -p 3000:3000 prairielearn/prairielearn

    This will run PrairieLearn with the example course.

1. Open a web browser and connect to http://localhost:3000/pl

1. When you are finished with PrairieLearn, type Control-C on the commandline where your ran the server to stop it.

1. To use your own course, point Docker to the correct directory (replace the precise path with your own):

        docker run -it --rm -p 3000:3000 -v C:\GitHub\pl-tam212:/course prairielearn/prairielearn

    or

        docker run -it --rm -p 3000:3000 -v /Users/mwest/git/pl-tam212:/course prairielearn/prairielearn

    If you are using Docker for Windows then you will need to first give Docker permission to access the C: drive (or whichever drive your course directory is on). This can be done by right-clicking on the Docker "whale" icon in the taskbar, choosing "Settings", and granting shared access to the C: drive.

    If you're in the root of your course directory already, you can substitute `%cd%` (on Windows) or `$PWD` (Linux and MacOS) for `/path/to/course`.

### Upgrading PrairieLearn with Docker

To obtain the latest version of PrairieLearn at any time, run:

    docker pull prairielearn/prairielearn

After this, run PrairieLearn using the same commands as above.

### Running a specific older version of PrairieLearn

The commands above will always run the very latest version of PrairieLearn, which might be an unreleased development version.

The list of available versions is viewable on the [hub.docker build page](https://hub.docker.com/r/prairielearn/prairielearn/builds/).

To run a specific older version (e.g., version 1.2.3) then you can do:

    docker run [args] prairielearn/prairielearn:1.2.3

### Running Commands in Docker

If needed, you can run the container with a different command:

    docker run -it --rm -p 3000:3000 -v /path/to/course:/course prairielearn/prairielearn COMMAND

This can be used to, e.g., run scripts distributed with PrairieLearn.

## Method 2: Docker with local copy of PrairieLearn

If you want to do development of PrairieLearn itself (not just question writing), then you'll need a local copy of PrairieLearn.

1. Clone PrairieLearn from the main repository:

        git clone https://github.com/PrairieLearn/PrairieLearn.git

1. Install the Node.js packages:

        cd PrairieLearn
        npm install

1. Run it with:

        docker run --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn


## Method 3: Fully local installation

To install PrairieLearn locally you should:

1. Install the pre-requisites:

    * [Node.js](http://nodejs.org/) version 7.3 or higher
    * [npm](https://npmjs.org/) (included with Node.js on Windows)
    * [PostgreSQL](https://www.postgresql.org) version 9.6 or higher
    * command-line git or [GitHub Desktop](https://desktop.github.com)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

  Note that with MacPorts you need to select the active version of PostgreSQL, for example `port select postgresql postgresql96`.

1. Clone the latest code:

        git clone https://github.com/PrairieLearn/PrairieLearn.git

1. If you are **NOT** using Ubuntu:

 (First, you're on your own to get node.js, NPM, and PostgreSQL installed ahead of time.)

 Create the database (one time only):

      initdb -D ~/defaultdb
 Run the database:

      pg_ctl -D ~/defaultdb -l ~/logfile start

1. If you **ARE** using Ubuntu:
 
 You need to get the latest node.js. Make sure the command in this step matches what's described at the following link, just in case there had been some kind of hijacking incident: [check here](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions)

      curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
      sudo apt-get install -y nodejs
      sudo apt-get install -y build-essential
 Install PostgreSQL: First, [add the repository for your version of Ubuntu](https://www.postgresql.org/download/linux/ubuntu/). Then you can install version 9.6:

      sudo apt-get install postgresql-9.6
 Make sure the cluster is set up:

      sudo pg_createcluster --start 9.6 main
 (You will probably get a message that it already exists.)

 Create a password for the postgres user:

      sudo passwd postgres
 Set it to "fnord" or whatever. Then enter it in the database settings:

      sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'fnord';"
 Edit this file (as root):

      sudo nano /etc/postgresql/9.6/main/pg_hba.conf
 Put this line in the file (not very secure, but it works):

      host all postgres 127.0.0.1 255.255.255.0 trust
 Restart the service. (This command can also be used later if the database isn't running after a reboot.)

      sudo pg_ctlcluster 9.6 main restart

1. Install the backend libraries:

        cd PrairieLearn
        npm install

1. Create the file `PrairieLearn/config.json` with the path of your local course repository:

        {
            "courseDirs": [
                "/Users/mwest/git/pl-tam212",
                "exampleCourse"
            ]
        }

1. Run the server:

        cd PrairieLearn
        node server

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with `Crtl-C`.

1. In a web browser go to: `http://localhost:3000/pl`
