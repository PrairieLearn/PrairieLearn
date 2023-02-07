# Installing natively

_WARNING:_ The recommended setup for PrairieLearn development is [within Docker](installingLocal.md). The setup described on this page is not recommended or supported.

This page describes the procedure to install and run PrairieLearn without any use of Docker. This means that PrairieLearn is running fully natively on the local OS.

- Install the pre-requisites:

  - [Node.js](http://nodejs.org/)
  - [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/)
  - [PostgreSQL](https://www.postgresql.org)
  - [Python 3](https://www.python.org)
  - command-line git or [GitHub Desktop](https://desktop.github.com)

On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

Note that with MacPorts you need to select the active version of PostgreSQL, for example `port select postgresql postgresql96`.

- Clone the latest code:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

- Install the Node.js libraries:

```sh
cd PrairieLearn
yarn
```

- Transpile code in `packages/`:

```sh
make build

# If you're actively working on the code in this directory, you can
# run the following command instead to automatically rebuild the files
# whenever you modify code.
make dev
```

- Make sure `python3` and `python3.6` will run the right version, and make executable links if needed:

```sh
python3 --version     # should return "Python 3.6" or higher
python3.6 --version   # should return "Python 3.6" or higher
```

- Install the Python libraries:

```sh
cd PrairieLearn/images/plbase
python3 -m pip install -r python-requirements.txt
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
node server
```

This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with `Crtl-C`.

- In a web-browswer go to [http://localhost:3000](http://localhost:3000)
