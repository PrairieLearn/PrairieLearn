
# Installing PrairieLearn on Linux or OS X

1. Install the pre-requisites:

  * [Node.js](http://nodejs.org/)
  * [npm](https://npmjs.org/)
  * [MongoDB](http://www.mongodb.org/)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/).

2. Next clone the latest code:

        $ git clone https://github.com/PrairieLearn/PrairieLearn.git

3. Install the backend libraries:

        $ cd PrairieLearn/backend
        $ npm install


## Running PrairieLearn

1. Run the database:

        $ mongod --dbpath ~/db

2. Run the server:

        $ cd PrairieLearn/backend
        $ node server

3. In a web-browswer go to http://localhost:3000
