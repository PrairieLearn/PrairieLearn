# Running natively

This page describes the procedure to install and run PrairieLearn fully natively without using Docker. Certain features, such as external graders and workspaces, still require Docker. PrairieLearn supports native execution on macOS, Linux, and Windows inside [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install).

- Install the prerequisites:

  - [Git](https://git-scm.com)
  - [Node.js 20](https://nodejs.org)
  - [Yarn](https://yarnpkg.com)
  - [Python 3.10](https://www.python.org)
  - [PostgreSQL 16](https://www.postgresql.org)
  - [Redis 6](https://redis.io)
  - [Graphviz](https://graphviz.org)
  - [d2](https://d2lang.com)
  - [pgvector](https://github.com/pgvector/pgvector)

Most of these prerequisites can be installed using the package manager of your OS:

=== "Ubuntu (WSL2)"

    On Ubuntu, use `apt` for the main prerequisites:

    ```sh
    sudo apt install git gcc libc6-dev graphviz libgraphviz-dev redis postgresql postgresql-contrib postgresql-server-dev-all
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

    Node.js 20 is not available in the default Ubuntu repositories -- you can install it through [nvm](https://github.com/nvm-sh/nvm).

    ```sh
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    source ~/.bashrc # or your shell's equivalent
    nvm install 20
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
    brew install git graphviz postgresql redis uv d2 node npm pgvector
    ```

    Enable `corepack` to make `yarn` available:

    ```sh
    corepack enable
    ```

=== "mise + uv"

    [Mise](https://mise.jdx.dev/) is a cross-platform package manager that supports per-directory tool versioning.

    First install git, graphviz, redis, and postgresql for Ubuntu or MacOS.

    Next install mise:

    ```sh
    curl https://mise.run | sh
    ```

    If you want to install globally, you can use `mise use -g`. Otherwise, you can omit the flag, causing the tool to be available only in that directory (e.g. the `PrairieLearn` directory).

    ```sh
    mise use -g node@20
    mise use -g npm:yarn
    mise use -g ubi:terrastruct/d2
    ```

    You can install Python 3.10 through mise:

    ```sh
    mise use -g python@3.10
    ```

    Or you can install it through [uv](https://github.com/astral-sh/uv) (recommended):

    ```sh
    mise use -g uv
    uv python install 3.10
    ```

    !!! note
        `uv` does not override the system Python, it is only active inside a `venv`.

- Clone the latest code:

  ```sh
  git clone https://github.com/PrairieLearn/PrairieLearn.git
  cd PrairieLearn
  ```

- Set up a Python virtual environment in the root of the cloned repository:

  === "uv"

        ```sh
        uv venv --python 3.10 --seed
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
  sudo -u postgres psql -c "CREATE USER postgres;"
  sudo -u postgres psql -c "ALTER USER postgres WITH SUPERUSER;"
  sudo -u postgres createdb postgres
  ```

- Ensure that your local `postgres` installation allows for local connections to bypass password authentication. First find the authentication configuration file with the command:

  ```sh
  sudo -u postgres psql -c "SHOW hba_file;"
  ```

  The command above will list the path to a file named `pg_hba.conf` or something equivalent. As either root or the `postgres` user, edit the file listed by the command above, such that lines that correspond to localhost connections are set up with the `trust` method (do not change the other lines). This will typically be shown as:

  ```text
  # TYPE  DATABASE        USER            ADDRESS                 METHOD
  ...
  # IPv4 local connections:
  host    all             all             127.0.0.1/32            trust
  # IPv6 local connections:
  host    all             all             ::1/128                 trust
  ```

  You may need to restart the PostgreSQL server after changing the file above.

- Run the test suite (Docker must be installed and running):

  ```sh
  make test
  ```

- Run the linters:

  ```sh
  make lint # or lint-js for Javascript only, or lint-python for Python only
  ```

- Create the file `PrairieLearn/config.json` with the path of your local course repository and with the path of a directory into which temporary files will be saved when using the in-browser file editor (edit both paths as needed):

  ```json title="config.json"
  {
    "courseDirs": ["/Users/mwest/git/pl-tam212", "exampleCourse"],
    "filesRoot": "../filesRoot",
    "workspaceHostHomeDirRoot": "/tmp/workspace",
    "workspaceHomeDirRoot": "/tmp/workspace"
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

- If you need support for [workspaces](workspaces/index.md), ensure Docker is installed and running, and then in a separate terminal run:

  ```sh
  sudo make dev-workspace-host # or sudo make start-workspace-host
  ```

- In a web-browser go to [http://localhost:3000](http://localhost:3000).

- To stop the server, use `Ctrl-C`.
