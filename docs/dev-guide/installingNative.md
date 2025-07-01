# Running natively

This page describes the procedure to install and run PrairieLearn fully natively without using Docker. Certain features, such as external graders and workspaces, still require Docker. PrairieLearn supports native execution on macOS, Linux, and Windows inside [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install).

## Installation

- Install the prerequisites:
  - [Git](https://git-scm.com)
  - [Node.js 22](https://nodejs.org)
  - [Yarn](https://yarnpkg.com)
  - [Python 3.10](https://www.python.org)
  - [PostgreSQL 16](https://www.postgresql.org)
  - [Redis 6](https://redis.io)
  - [Graphviz](https://graphviz.org)
  - [d2](https://d2lang.com)
  - [pgvector](https://github.com/pgvector/pgvector)

Most of these prerequisites can be installed using the package manager of your OS:

=== "Ubuntu (including WSL2)"

    On Ubuntu, use `apt` for the main prerequisites:

    ```sh
    sudo apt install git gcc libc6-dev graphviz libgraphviz-dev redis postgresql postgresql-contrib postgresql-server-dev-all
    # Optional; needed only for some example questions that use LaTeX
    sudo apt install texlive texlive-latex-extra texlive-fonts-extra dvipng
    ```

    Make sure you start Postgres:

    ```sh
    sudo systemctl start postgresql.service
    ```

    > If the command above shows an error like `System has not been booted with systemd as init system` or `Failed to connect to bus`, the command above can be replaced with:
    >
    > ```sh
    > sudo service postgresql start
    > ```

    Python 3.10 is not available in the default Ubuntu repositories -- you can install it through the [deadsnakes PPA](https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa):

    ```sh
    sudo add-apt-repository ppa:deadsnakes/ppa
    sudo apt update
    sudo apt install python3.10 python3.10-dev
    ```

    Install `uv`:

    ```sh
    pip install uv
    ```

    Node.js 22 is not available in the default Ubuntu repositories -- you can install it through [nvm](https://github.com/nvm-sh/nvm).

    ```sh
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    source ~/.bashrc # or your shell's equivalent
    nvm install 22
    ```

    Enable `corepack` to make `yarn` available:

    ```sh
    corepack enable
    ```

    d2 can be installed through the install script:

    ```sh
    curl -fsSL https://d2lang.com/install.sh | sh -s --
    ```

    The pgvector Postgres extension can be installed with the following script:

    ```sh
    cd /tmp
    git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
    cd pgvector
    make
    sudo make install
    ```

=== "macOS"

    On macOS, ensure you have installed the XCode command line tools:

    ```sh
    xcode-select --install
    ```

    The main prerequisites can be installed with [Homebrew](http://brew.sh/):

    ```sh
    brew install git graphviz postgresql@16 redis uv d2 node pgvector python@3.10

    # Optional; needed only for some example questions that use LaTeX
    brew install texlive
    ```

    You may want to start up the `postgresql` server on boot, and add binaries to your path:

    ```sh
    brew services start postgresql@16
    brew link postgresql@16
    ```

    Enable `corepack` to make `yarn` available:

    ```sh
    corepack enable
    ```

    !!! bug

        See [astral-sh/python-build-standalone/issues/146](https://github.com/astral-sh/python-build-standalone/issues/146#issuecomment-2981797869) for why we use the system Python version.

- Clone the latest code:

  ```sh
  git clone https://github.com/PrairieLearn/PrairieLearn.git
  cd PrairieLearn
  ```

- Set up a Python virtual environment in the root of the cloned repository:

  === "uv"

        ```sh
        uv venv --python-preference only-system --python 3.10 --seed
        source .venv/bin/activate
        ```

  === "Native"

        ```sh
        python3.10 -m venv .venv
        source .venv/bin/activate
        ```

  You can run `deactivate` to exit the virtual environment, and `source .venv/bin/activate` to re-enter it.

- On macOS, set the following environment variables so that `pygraphviz` can [find the necessary headers](https://github.com/pygraphviz/pygraphviz/blob/main/INSTALL.txt):

  ```sh
  cat << EOF >> .venv/bin/activate
  export CFLAGS="-I$(brew --prefix graphviz)/include"
  export LDFLAGS="-L$(brew --prefix graphviz)/lib"
  EOF
  
  source .venv/bin/activate
  ```

- Install all dependencies and transpile local packages:

  ```sh
  make deps
  ```

  The above command installs everything. Alternatively, you can run each step individually:

  ```sh
  yarn
  make build
  make python-deps
  ```

- Make sure the `postgres` database user exists and is a superuser (these might error if the user already exists):

```sh
createdb postgres
psql postgres -c "CREATE USER postgres;"
psql postgres -c "ALTER USER postgres WITH SUPERUSER;"
```

- Ensure that your local `postgres` installation allows for local connections to bypass password authentication. First find the authentication configuration file with the command:

  ```sh
  psql postgres -c "SHOW hba_file;"
  ```

  The command above will list the path to a file named `pg_hba.conf` or something equivalent. As either root or the `postgres` user, edit the file listed by the command above, such that lines that correspond to localhost connections are set up with the `trust` method (do not change the other lines). If the last two lines already say "trust", no modifications are needed. This will typically be shown as:

  ```text
  # TYPE  DATABASE        USER            ADDRESS                 METHOD
  ...
  # IPv4 local connections:
  host    all             all             127.0.0.1/32            trust
  # IPv6 local connections:
  host    all             all             ::1/128                 trust
  ```

  You may need to restart the PostgreSQL server after changing the file above.

## Configuration

If you have your own [PrairieLearn course repository](../requestCourse/index.md), you will need to create the file `PrairieLearn/config.json` with the path of your local course repository. If you need support for the in-browser file editor or file uploads, you should set `filesRoot`. If you need support for workspaces, you should provide a path to a directory into which temporary files will be saved. Here is a sample configuration:

```json title="config.json"
{
  "courseDirs": ["/Users/mwest/git/pl-tam212", "exampleCourse"],
  "filesRoot": "../filesRoot",
  "workspaceHostHomeDirRoot": "/tmp/workspace",
  "workspaceHomeDirRoot": "/tmp/workspace"
}
```

More information about the `config.json` can be found in the [server configuration](./configJson.md) documentation.

## Development

More information on the development workflow can be found in the [development quickstart](./quickstart.md) documentation.
