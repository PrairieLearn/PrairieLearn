
# Admin: Getting a changelog when deploying new versions

Run the following command to create the `git changelog` alias if you don't already have it.

```sh
git config --global alias.changelog 'log --graph --date=short --format=format:"%s -- %an [%h]"'
```

Before deploying, find the commit hash of the version that was previously deployed.

```sh
git rev-parse --short HEAD
```

Then, grab a local git copy of the PrairieLearn source and run the changelog alias to get the diff:

```sh
git checkout master
git pull
git changelog [previous hash]...master
```
