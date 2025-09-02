# Development quickstart

This page describes how to run, test, and develop PrairieLearn. Ensure that you have already installed PrairieLearn either:

- Natively, by following the [running natively](installingNative.md) guide
- Via Docker, by following the [running via Docker](installingLocal.md) guide

## Development server

Run the server in development mode to automatically restart when changes are detected:

```sh
make dev
```

In a web-browser go to [http://localhost:3000](http://localhost:3000).

To stop the server, use ++ctrl+c++.

## Production build

You can also build and run using pre-compiled versions of the server code to more closely mimic what will happen in production environments. View the [running in production setup instructions](../running-in-production/setup.md) for more information.

```sh
make build
make start
```

## Workspaces

If you need support for [workspaces](../workspaces/index.md), ensure Docker is installed and running, and then in a separate terminal run:

```sh
sudo make dev-workspace-host # or sudo make start-workspace-host
```

## Documentation

If you want to preview the documentation, run:

```sh
make preview-docs
```

## Testing

If you are contributing code to PrairieLearn, you must ensure that your changes work and pass our style guidelines. More information on debugging and testing can be found on the [developer guide](./guide.md). Information on contributing can be found on the [contribution guide](../contributing.md).

Run the test suite (Docker must be installed and running):

```sh
make test
```

Or, to run tests for just a specific language:

```sh
make test-js     # Javascript only
make test-python # Python only
```

### JavaScript tests

The main JavaScript test suite can take on the order of 10+ minutes to run, so you may only run specific test files as you develop. To run specific test files, you first need to run `make start-support` to start the database and other services, and then you can run specific test files.

```sh
make start-support
cd apps/prairielearn
yarn vitest src/tests/getHomepage.test.ts
```

### Package tests

To test a specific package, you can run `yarn test` from the package's directory.

```sh
cd packages/csv
yarn test
```

## Linting

All changes to PrairieLearn must pass our linters before they get merged.

```sh
make lint
```

Or, to lint only specific kind of files:

```sh
make lint-js     # JavaScript only
make lint-python # Python only
make lint-all    # Additional linters
```

## Formatting

You can format files with:

```sh
make format-js-cached
make format-python
```

If you develop code with VSCode, running these shouldn't be necessary, as we provide a set of recommended extensions and configuration defaults that will format files on save.

## Updating dependencies

If you switch branches, pull new code, or edit Python dependencies, you will need to update the dependencies.

```sh
make deps
```

## Working on packages

When working on something in the `packages/` directory, you'll need to rebuild the package before any changes will become visible to other packages or apps that use the package. You can build everything with `make build`, or you can run the `dev` script in a package to rebuild it automatically whenever there are changes.

```sh
# From the root of the repository:
yarn workspace @prairielearn/postgres run dev

# From a specific package directory, e.g. `packages/postgres`:
yarn dev
```

## More information

Most information about development is found in the [developer guide](./guide.md). It outlines debugging and testing tips, best practices and style for coding, as well as details about various aspects of PrairieLearn (question rendering, databases schemas, etc.).
