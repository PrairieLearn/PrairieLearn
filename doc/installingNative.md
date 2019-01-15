
# Installing natively

This page describes one way to install and run PrairieLearn without any use of Docker on MacOS.

* Install XCode Command-Line Tools to get command-line `git` (among other things):

```sh
xcode-select --install
```

* Install [Node.js](http://nodejs.org/) by downloading and running the installation package. This will get you both `node` and `npm`.

* Install [homebrew](https://brew.sh).

* Install [miniconda](https://conda.io/docs/user-guide/install/macos.html#).

* Use `git` to clone the PrairieLearn repo (put it wherever you want), and then `cd` to that directory:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

Use `git pull` as usual to keep your clone up to date.

* Use homebrew to install [R](https://www.r-project.org):

```sh
brew install r
```

* Use homebrew to install [PostgreSQL](https://www.postgresql.org):

```sh
brew install postgresql
```

* Use conda to create a virtual environment (e.g., with name `PL`):

```sh
conda create -n PL python=3.6
conda activate PL
```

* Make sure `python`, `python3`, and `python3.6` will all run the right version:

```sh
python --version      # should return "Python 3.6.x"
python3 --version     # should return "Python 3.6.x"
python3.6 --version   # should return "Python 3.6.x"
```

* Install the python packages that are used on the production server:

```sh
cd PrairieLearn
python -m pip install -r environments/centos7-plbase/python-requirements.txt
```

* (Optionally, install the R packages that are used on the production server, as in `environments/centos7-plbase/r-requirements.R`.)

* Use `npm` to install the node libraries, specifying the use of python 2.7 to avoid failure on `node-gyp rebuild`:

```sh
cd PrairieLearn
npm ci --python=/usr/bin/python2.7
```

    (Replace the path to `python2.7` if necessary.)

    Repeat this process every time you `git pull`. It is important to use `npm ci` (which replaces `node_modules` on each call) and not `npm install`, or you will cause changes to `package.json` and/or `package-lock.json`.

* Create the database (one time only):

```sh
initdb -D ~/defaultdb
```

* Run the database (each time you restart your computer):

```sh
pg_ctl -D ~/defaultdb -l ~/logfile start
```

    Note that you can put `defaultdb` and `logfile` anywhere you like.

* Make sure the `postgres` database user exists and is a superuser (these might error if the user already exists):

```sh
psql -c "CREATE USER postgres;"
psql -c "ALTER USER postgres WITH SUPERUSER;"
```

    If you see an error, try `createdb your-user-name`, then repeat.

    If you want to re-create the `postgres` database, do `dropdb postgres; createdb postgres`.

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
