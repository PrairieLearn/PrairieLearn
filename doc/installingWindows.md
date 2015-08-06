
# Installing PrairieLearn on Windows

1. Install the pre-requisites:

  * [Node.js](http://nodejs.org/)
  * [MongoDB](http://www.mongodb.org/)
  * [GitHub for Windows](https://windows.github.com)

2. Make an account on [GitHub](https://www.github.com) and ask [Matt West](mwest@illinois.edu) to add you to the PrairieLearn organization.

2. Next clone the latest code:

   * Open GitHub for Windows (the program, not the website)
   * Click the `+` button in the upper left to add a repository
   * From within the PrairieLearn organization, clone the PrairieLearn repository. Note where it is installed it (e.g., `C:\GitHub`) for use below.

3. Install the backend libraries:

        $ cd C:\GitHub\PrairieLearn\backend
        $ npm install


## Running PrairieLearn

1. Run the database:

        $ "C:\Program Files\mongod" --dbpath ~/db

2. Run the server:

        $ cd C:\GitHub\PrairieLearn\backend
        $ node server

3. In a web-browswer go to http://localhost:3000
