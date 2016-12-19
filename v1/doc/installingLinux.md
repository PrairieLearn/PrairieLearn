
# Installing PrairieLearn on Linux or OS X

1. Install the pre-requisites:

  * [Node.js](http://nodejs.org/)
  * [npm](https://npmjs.org/)
  * [MongoDB](http://www.mongodb.org/)
  * command-line git or [GitHub Desktop](https://desktop.github.com)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

1. Next clone the latest code:

        $ git clone https://github.com/PrairieLearn/PrairieLearn.git

1. Install the backend libraries:

        $ cd PrairieLearn/backend
        $ npm install


## Running PrairieLearn

1. Run the database:

        $ mkdir ~/db     # or any other directory you want
        $ mongod --dbpath ~/db

   This should end with a message like `waiting for connections on port 27017` and will remain running in the foreground, so this terminal can't be used for anything else. Use Crtl-C to stop the database at any time.

1. Run the server:

        $ cd PrairieLearn/backend
        $ node server

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with Crtl-C.

1. In a web-browswer go to http://localhost:3000


## Updating PrairieLearn

1. Stop the PrairieLearn server with Ctrl-C.

1. Pull the latest version of PrairieLearn:

        $ cd PrairieLearn
        $ git pull

1. Ensure the libraries are up-to-date with:

        $ cd PrairieLearn/backend
        $ npm update

1. Restart the PrairieLearn server:

        $ cd PrairieLearn/backend
        $ node server

   If this gives an error that it `Cannot find module`, then make sure the `npm update` command in the previous step was successful.
