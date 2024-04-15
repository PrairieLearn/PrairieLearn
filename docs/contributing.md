# Contributing to PrairieLearn

- [Good blog post on how to contribute via GitHub](http://blog.davidecoppola.com/2016/11/howto-contribute-to-open-source-project-on-github/)

## GitHub: distributed model

**Getting started as a collaborator:** Everyone should fork the main repository on GitHub. The full name of this repository is `PrairieLearn/PrairieLearn` (`"organization_name/repo_name"`); when you fork it, GitHub will create a repo named `user_name/PrairieLearn`. If you're not sure how to fork the repo, see [Github's instructions](https://help.github.com/articles/fork-a-repo/).

Before you go further, you will need to set up your own SSH keys and associate them with your GitHub account (if you haven't already). If you're not sure how to set them up, see [Connecting to GitHub with SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh).

Next, clone your forked repository to your local machine and set up the main repository as an "upstream" repository:

```sh
git clone git@github.com:$user_name/PrairieLearn.git
cd PrairieLearn
git remote add upstream git@github.com:PrairieLearn/PrairieLearn.git
```

This means that you now have three key repositories to keep track of:

- **Upstream:** the main PrairieLearn repository on GitHub. You can't directly push to this, but this is where you will pull other people's commits from.
- **Origin:** your forked repository on GitHub. You can push and pull directly to this.
- **Local:** your clone of origin on your local computer. This is where you commit before pushing to origin.

**Important note:** Don't ever commit anything to the `master` branch. You should do all your work in branches and issue pull requests from these branches back to the main PrairieLearn repository.

**Updating your fork from upstream:** Getting new changes from upstream is a two-step process. First you pull from upstream to your local repository, then you push the new changes back to your origin. (There is no direct communication between upstream and your forked origin repository.) Note that for this to work it is critical that you have never committed anything to your master branch. The procedure to pull and then push is:

```sh
git checkout master      # make sure you are on the master branch
git pull upstream master # pull new changes from upstream
git push origin master   # push the new changes back up to your fork (origin)
```

See also the GitHub Help pages on [Syncing a fork](https://help.github.com/articles/syncing-a-fork/) and [Pushing to a remote](https://help.github.com/articles/pushing-to-a-remote/).

**Editing, committing, and pushing your code:** You should only ever commit and push code on a branch (never on `master`). To start a new branch, do:

```sh
git checkout -b branch_name
```

Later, you can do:

```sh
git checkout branch_name    # make sure you are on the right branch
# ... edit code
git add "FILE.js"
git commit -m "MESSAGE"
git push origin branch_name # this should be the same as the branch you checked out
```

This makes local code changes and then pushes them up to your forked repository (origin). See also [Pushing to a remote](https://help.github.com/articles/pushing-to-a-remote/) on the GitHub Help pages.

**Merging your code back into upstream and master:** You should never merge your branches into your own master. Instead, issue Pull Requests (PRs) to have them merged back into the main PrairieLearn repository. To do this:

1. Go to the GitHub page for your forked repository.
1. Switch to the branch that you want to merge using the branch dropdown.
1. Click the green compare-and-review button (with two tip-to-tail arrows making a square).
1. Click the green "Create pull request" button.

Once your code is accepted, you can then get it back into your master by updating your fork from upstream, and then you can delete your branch that was merged. See also [Using pull requests](https://help.github.com/articles/using-pull-requests/) on GitHub Help.

## Branches and tags

PrairieLearn version numbers have the format `major.minor.patch`. Patch-level changes are only for bugfixes.

Branches:

- `master` - current development branch
- `1.0`, `1.1`, `2.0` - release branches
- all other branches are for private feature development

Tags:

- `1.0.0`, `1.0.1`, `1.0.2` - releases on the `1.0` branch, corresponding to `prairielearn-1.0.X.tar.gz` release tarballs.

Main repository topology:

```text
*  master branch
|
| *  2.1.4 tag, 2.1 branch
| *  2.1.3 tag
| *  2.1.2 tag
| *  2.1.1 tag
|/
*  2.1.0 tag
|
*  2.0.0 tag, 2.0 branch
|
| *  1.2.1 tag, 1.2 branch
|/
*  1.2.0 tag
|
| *  1.1.1 tag, 1.1 branch
| *  1.1.0 tag
|/
*  1.0.0 tag
```

## FAQ

### I forgot to branch. How do I move changes from master to a new branch?

No problem, assuming that you have not made any commits yet.
First, create and checkout a new branch in which to keep your changes, leaving the current branch as is.

```
git checkout -b <new-branch>
```

Then, make a commit as you normally would:

```
git add <files>
git commit -m "<Brief description of this commit>"
```

Once your commit is made, you can checkout and reset master.

[See here for more information.](https://stackoverflow.com/questions/1394797/move-existing-uncommited-work-to-a-new-branch-in-git)
