
# Contributing to PrairieLearn

For background information on using git effectively, see Matt's [git quick reference](http://lagrange.mechse.illinois.edu/git_quick_ref/).

## GitHub: distributed model (for contributors)

**Getting started as a collaborator:** Everyone should fork the main repository on GitHub. Assuming the main repository is in an organization called `org`, so it's full name is `org/code_name`, then the forked version for user `user_name` will be `user_name/code_name`. Next, clone the forked repository to your local machine and set up the main repository as the upstream (cf. [Fork a repo](https://help.github.com/articles/fork-a-repo/) on GitHub Help):

        git clone git@github.com/user_name/code_name.git
        git remote add upstream git@github.com/org/code_name.git

This means that you now have three key repositories to keep track of:

* **Upstream:** the main central repository on GitHub. You can't directly push to this, but this is where you will pull other people's commits from.
* **Origin:** your forked repository on GitHub. You can push and pull directly to this.
* **Local:** your clone of origin on your local computer. This is where you commit before pushing to origin.


**Important note:** Don't ever commit anything to the `master` branch. Only the upstream owner should ever commit to `master`. You should do all your work in branches and issue pull requests on these branches back to upstream.

**Updating your fork from upstream:** Getting new changes from upstream is a two-step process. First you pull from upstream to your local repository, then you push the new changes back to your origin. There is no direct communication between upstream and your forked origin repository. Note that for this to work it is critical that you have never committed anything to your master branch. The procedure to pull and then push is:

        git checkout master      # make sure you are on the master branch
        git pull upstream master # pull new changes from upstream
        git push origin master   # push the new changes back up to your fork (origin)

See also the GitHub Help pages on [Syncing a fork](https://help.github.com/articles/syncing-a-fork/) and [Pushing to a remote](https://help.github.com/articles/pushing-to-a-remote/).

**Editing, committing, and pushing your code:** You should only ever commit and push code on a branch (never on `master`). To start a new branch, do:

        git checkout -b branch_name

Later, you can do:

        git checkout branch_name   # make sure you are on the right branch
        # ... edit code
        git add &lt;code&gt;
        git commit -m "&lt;message&gt;"
        git push origin branch_name

This makes local code changes and then pushes them up to your forked repository (origin). See also [Pushing to a remote](https://help.github.com/articles/pushing-to-a-remote/) on the GitHub Help pages.

**Merging your code back into upstream and master:** You should never merge your branches into your own master. Instead, issue Pull Requests (PRs) to have them merged back into the upstream master by the owner of upstream. To do this:

1. Go to the GitHub page for your forked repository.
1. Switch to the branch that you want to merge using the branch dropdown.
1. Click the green compare-and-review button (with two tip-to-tail arrows making a square).
1. Click the green "Create pull request" button.

Once the upstream owner merges your code, you can then get it back into your master by updating your fork from upstream, and then you can delete your branch that was merged. See also [Using pull requests](https://help.github.com/articles/using-pull-requests/) on GitHub Help.


## GitHub: distributed model (for owners)

**Starting the project:** Make a repo on GitHub called `code_name` and a team also called `code_name`. Add the repository to the team, set team permissions to "read access", and add people to the team. If there is going to be more than one maintainer with direct write access, then make a `code_name_maintainers` team with "write access". Alternatively, if this is a public repository with just one owner/maintainer then no teams are needed.


## Branches and tags

PrairieLearn version numbers have the format `major.minor.patch`. Patch-level changes are only for bugfixes.

Branches:

* `master` - current development branch
* `1.0`, `1.1`, `2.0` - release branches
* all other branches are for private feature development

Tags:

* `1.0.0`, `1.0.1`, `1.0.2` - releases on the `1.0` branch, corresponding to `prairielearn-1.0.X.tar.gz` release tarballs.

Main repository topology:

        *  master branch
        | *  2.1 branch, 2.1.4 tag
        | *  2.1.3 tag
        | *  2.1.2 tag
        | *  2.1.1 tag
        | *  2.1.0 tag
        |/  
        *  2.0.0 tag
        | *  1.2 branch, 1.2.1 tag
        |/  
        *  1.2.0 tag
        | *  1.1 branch, 1.1.1 tag
        | *  1.1.0 tag
        |/  
        *  1.0.0 tag
