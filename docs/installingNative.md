# Running natively

_WARNING:_ The recommended setup for PrairieLearn development is [within Docker](installingLocal.md). The setup described on this page is not recommended or supported.

This page describes the procedure to install and run PrairieLearn without any use of Docker. This means that PrairieLearn is running fully natively on the local OS.

- Install the prerequisites:

  - [Node.js](http://nodejs.org/)
  - [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/)
  - [PostgreSQL 15](https://www.postgresql.org)
  - [Python 3.10](https://www.python.org)
  - [Graphviz](https://graphviz.org/download)
  - command-line git or [GitHub Desktop](https://desktop.github.com)

  On macOS these can be installed with [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distribution.

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

- Create the database (one time only):

  ```sh
  initdb -D ~/defaultdb
  ```

- Run the database:

  ```sh
  pg_ctl -D ~/defaultdb -l ~/logfile start
  ```

- Make sure the `postgres` database user exists and is a superuser (these might error if the user already exists):

  ```sh
  psql -c "CREATE USER postgres;"
  psql -c "ALTER USER postgres WITH SUPERUSER;"
  ```

- Run the test suite:

  ```sh
  cd PrairieLearn
  make test
  ```

- Run the linters:

  ```sh
  cd PrairieLearn
  make lint # or lint-js for Javascript only, or lint-python for Python only
  ```

- Create the file `PrairieLearn/config.json` with the path of your local course repository and with the path of a directory into which temporary files will be saved when using the in-browser file editor (edit both paths as needed):

  ```json
  {
    "courseDirs": ["/Users/mwest/git/pl-tam212", "exampleCourse"],
    "filesRoot": "../filesRoot"
  }
  ```

- Run the server:

  ```sh
  cd PrairieLearn
  make build
  make start
  ```

- In a web-browser go to [http://localhost:3000](http://localhost:3000).

- To stop the server, use `Ctrl-C`. If you want the server to automatically restart when changes are detected, you can run `make dev` instead of `make start`.
