# Running natively

This page describes the procedure to install and run PrairieLearn without any use of Docker. This means that PrairieLearn is running fully natively on the local OS.

- Install the prerequisites:

  - [Git](https://git-scm.com)
  - [Node.js](https://nodejs.org)
  - [Yarn](https://classic.yarnpkg.com)
  - [Python 3.10](https://www.python.org)
  - [PostgreSQL 15](https://www.postgresql.org)
  - [Redis](https://redis.io)
  - [Graphviz](https://graphviz.org)

  On macOS, these can be installed with [Homebrew](http://brew.sh/). On Linux, these should all be standard packages from the OS distribution.

  On macOS, you should ensure you have installed the XCode command line tools:

  ```sh
  xcode-select --install
  ```

- Clone the latest code:

  ```sh
  git clone https://github.com/PrairieLearn/PrairieLearn.git
  cd PrairieLearn
  ```

- Install all dependencies and transpile local packages:

  ```sh
  # This one command will do everything!
  make deps

  # Alternatively, you can run each step individually:
  yarn
  make build
  make python-deps
  ```

  On macOS, you may need to first set the following environment variables so that `pygraphviz` can find the necessary headers:

  ```sh
  export CFLAGS="-I$(brew --prefix graphviz)/include"
  export LDFLAGS="-L$(brew --prefix graphviz)/lib"
  ```

- Make sure the `postgres` database user exists and is a superuser (these might error if the user already exists):

  ```sh
  psql -c "CREATE USER postgres;"
  psql -c "ALTER USER postgres WITH SUPERUSER;"
  ```

- Run the test suite:

  ```sh
  make test
  ```

- Run the linters:

  ```sh
  make lint # or lint-js for Javascript only, or lint-python for Python only
  ```

- Create the file `PrairieLearn/config.json` with the path of your local course repository and with the path of a directory into which temporary files will be saved when using the in-browser file editor (edit both paths as needed):

  ```json
  {
    "courseDirs": ["/Users/mwest/git/pl-tam212", "exampleCourse"],
    "filesRoot": "../filesRoot"
  }
  ```

- Run the server in development mode to automatically restart when changes are detected:

  ```sh
  make dev
  ```

  Alternatively, you can build and run the code to more closely mimic what will happen in production environments:

  ```sh
  make build
  make start
  ```

- In a web-browser go to [http://localhost:3000](http://localhost:3000).

- To stop the server, use `Ctrl-C`.
