# PrairieLib

PrairieLib is a NodeJS library used in [PrairieLearn](https://github.com/PrairieLearn/PrairieLearn).

[![Latest version](https://img.shields.io/github/tag/PrairieLearn/PrairieLib.svg?label=version)](https://github.com/PrairieLearn/PrairieLib) [![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=PrairieLearn/PrairieLib)](https://dependabot.com) [![Build Status](https://github.com/PrairieLearn/PrairieLib/workflows/CI/badge.svg)](https://github.com/PrairieLearn/PrairieLib/actions) [![License](https://img.shields.io/github/license/PrairieLearn/PrairieLib.svg)](https://github.com/PrairieLearn/PrairieLib/blob/master/LICENSE)

### Publishing instructions for a new version

```
git checkout master
git pull -p
npm version minor  # or major/patch to bump version and commit
git push
git push --tags
npm publish
```
