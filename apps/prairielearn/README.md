# PrairieLearn frontend and backend

More information about developing and contributing to PrairieLearn can be found on the docs in the [developer guide](https://docs.prairielearn.com/dev-guide/).

Key directories:

- [`elements`](./elements/): Contains the custom `pl-*` elements used in PrairieLearn ([element documentation](https://docs.prairielearn.com/elements/)). Information on creating custom elements can be found on the [element developer guide](https://docs.prairielearn.com/devElements/).
- [`src/pages`](./src/pages/): Contains the individual pages of the PrairieLearn application. The mapping of URLs to pages is defined in [`server.ts`](./src/server.ts).

## Python helper package

PrairieLearn's shared Python helper package can be installed from this repository's Python subdirectory with pip:

```sh
python -m pip install "prairielearn @ git+https://github.com/PrairieLearn/PrairieLearn.git@<commit>#subdirectory=apps/prairielearn/python"
```

Or with uv:

```sh
uv add "prairielearn @ git+https://github.com/PrairieLearn/PrairieLearn.git@<commit>#subdirectory=apps/prairielearn/python"
```
