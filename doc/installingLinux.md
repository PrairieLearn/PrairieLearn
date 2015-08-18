
# Installing PrairieLearn on Linux or OS X

1. Install the pre-requisites:

  * [Node.js](http://nodejs.org/)
  * [npm](https://npmjs.org/)
  * [MongoDB](http://www.mongodb.org/)
  * command-line git or [GitHub Desktop](https://desktop.github.com)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

2. Next clone the latest code:

        $ git clone https://github.com/PrairieLearn/PrairieLearn.git

3. Install the backend libraries:

        $ cd PrairieLearn/backend
        $ npm install


## Running PrairieLearn

1. Run the database:

        $ mkdir ~/db     # or any other directory you want
        $ mongod --dbpath ~/db

   This should end with a message like `waiting for connections on port 27017` and will remain running in the foreground, so this terminal can't be used for anything else. Use Crtl-C to stop the database at any time.

2. Run the server:

        $ cd PrairieLearn/backend
        $ node server

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with Crtl-C.

3. In a web-browswer go to http://localhost:3000
