# schemas

Schemas for various PrairieLearn JSON files. They are designed to be published independently of PrairieLearn for consumption by other tools or applications. They are published on npm in the `@prairielearn/schemas` package.

## Publishing to npm

First, bump the version number in the `package.json` file in this directory (_not_ in the root of the PrairieLearn repo). Then, simply run `npm publish` to publish the new version to `npm`.

Note that PrairieLearn consumes these schemas directly and not from the package, so it isn't necessary to publish a new version to test changes or before making a PR that utilizes changed schemas.
