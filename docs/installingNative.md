# Running natively

This page describes the procedure to install and run PrairieLearn without any use of Docker. This means that PrairieLearn is running fully natively on the local OS. PrairieLearn supports native execution on macOS, Linux, and Windows inside [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install).

- Install the prerequisites:

  - [Git](https://git-scm.com)
  - [Node.js 20](https://nodejs.org)
  - [Yarn](https://yarnpkg.com)
  - [Python 3.10](https://www.python.org)
  - [PostgreSQL 15](https://www.postgresql.org)
  - [Redis 6](https://redis.io)
  - [Graphviz](https://graphviz.org)
  - [d2](https://d2lang.com)

Most of these prerequisites can be installed using the package manager of your OS:

=== "Ubuntu (WSL2)"

    On Ubuntu, these can be installed with `apt`:

    ```sh
    sudo apt install git gcc libc6-dev graphviz graphviz-dev redis6 postgresql15 postgresql15-server postgresql15-contrib
    ```

=== "macOS"

    On macOS, these can be installed with [Homebrew](http://brew.sh/). You should also ensure you have installed the XCode command line tools:

    ```sh
    xcode-select --install
    ```

    ```sh
    brew install git graphviz postgresql@15 redis@6.2
    ```

---

Now you can install the other dependencies.

=== "Ubuntu (WSL2)"

    Python 3.10 is not available in the default Ubuntu repositories -- you can install it through the [deadsnakes PPA](https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa):

    ```sh
    sudo add-apt-repository ppa:deadsnakes/ppa
    sudo apt update
    sudo apt install python3.10 python3.10-dev
    ```

    Node.js 20 is not available in the default Ubuntu repositories -- you can install it through [nvm](https://github.com/nvm-sh/nvm).

    ```sh
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    source ~/.bashrc # or your shell's equivalent
    nvm install 20
    ```

    You can then install yarn through npm:

    ```sh
    npm install -g yarn
    ```

    d2 can be installed through the install script:

    ```sh
    curl -fsSL https://d2lang.com/install.sh | sh -s --
    ```

=== "macOS"

    Brew can install the rest of the dependencies.

    ```sh
    brew install node@20 python@3.10
    ```

    You can install yarn through npm:

    ```sh
    npm install -g yarn
    ```

    d2 can be installed through the install script:

    ```sh
    curl -fsSL https://d2lang.com/install.sh | sh -s --
    ```

=== "mise + uv"

    [Mise](https://mise.jdx.dev/) is a cross-platform package manager that supports per-directory tool versioning.

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

    Or you can install it through [uv](https://github.com/astral-sh/uv) (reccomended):

    ```sh
    mise use -g uv
    uv python install 3.10
    ```

    !!! note
        `uv` does not override the system Python, it is only active inside a `venv`.

---

- Clone the latest code:

  ```sh
  git clone https://github.com/PrairieLearn/PrairieLearn.git
  cd PrairieLearn
  ```

!!! note "Setup a venv"

    It is recommended to use a virtual environment for Python dependencies. You can create a virtual environment within PrairieLearn:

    === "Native"

        ```sh
        python3.10 -m venv venv
        source venv/bin/activate
        ```

    === "uv"

        ```sh
        uv venv
        source venv/bin/activate
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
  createdb postgres
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

  ```json title="config.json"
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
