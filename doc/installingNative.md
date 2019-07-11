
# Installing natively

This page describes the procedure to install and run PrairieLearn without any use of Docker. This means that PrairieLearn is running fully natively on the local OS. This installation method is tested and supported on MacOS and Linux, but not on Windows. It should also work on Windows, but it is not tested.

* Install the pre-requisites:

    * [Node.js](http://nodejs.org/) version  or higher
    * [npm](https://npmjs.org/) (included with Node.js on Windows)
    * [PostgreSQL](https://www.postgresql.org) version 9.6 or higher
    * [Python 3](https://www.python.org) version 3.6 or higher
    * command-line git or [GitHub Desktop](https://desktop.github.com)

On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/). On Linux these should all be standard packages from the OS distrbution.

Note that with MacPorts you need to select the active version of PostgreSQL, for example `port select postgresql postgresql96`.

* Clone the latest code:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js libraries:

```sh
cd PrairieLearn
npm install
```

On OS X, it is possible that this process will fail on `node-gyp rebuild` during the install of `mcrypt`. In this case, use the following command instead:

```sh
npm install --python=PATH_TO_PYTHON2
```

For example, this might be:

```sh
npm install --python=/usr/bin/python2.7
```

* Make sure `python3` and `python3.6` will run the right version, and make executable links if needed:

```sh
python3 --version     # should return "Python 3.6" or higher
python3.6 --version   # should return "Python 3.6" or higher
```

* Install the Python libraries:

```sh
cd PrairieLearn
python3 -m pip install -r requirements.txt
```

* Create the database (one time only):

```sh
initdb -D ~/defaultdb
```

* Run the database:

```sh
pg_ctl -D ~/defaultdb -l ~/logfile start
```

* Make sure the `postgres` database user exists and is a superuser (these might error if the user already exists):

```sh
psql -c "CREATE USER postgres;"
psql -c "ALTER USER postgres WITH SUPERUSER;"
```

* Run the test suite:

```sh
cd PrairieLearn
npm test
```

* Run the linters:

```sh
cd PrairieLearn
npm run lint-js -s
npm run lint-python -s
```

* Create the file `PrairieLearn/config.json` with the path of your local course repository (edit the path as needed):

```json
{
    "courseDirs": [
        "/Users/mwest/git/pl-tam212",
        "exampleCourse"
    ]
}
```

* Run the server:

```sh
cd PrairieLearn
node server
```

   This should end with `PrairieLearn server ready` and will remain running in the foreground, so this terminal can't be used for anything else. Stopping or restarting the server can be done with `Crtl-C`.

* In a web-browswer go to [http://localhost:3000](http://localhost:3000)
