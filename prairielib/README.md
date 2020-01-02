
# PrairieLib

[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=PrairieLearn/PrairieLib)](https://dependabot.com)


### Publishing instructions for a new version

```
git checkout master
git pull -p
npm version minor  # or major/patch to bump version and commit
git push --tags
npm publish
```
