
# Syncing course data with GitHub

A live PrairieLearn server can be set up to allow syncing with a course data repository on GitHub (or another remote git repository).

If enabled, `Instructor` users will see a __Sync__ page on PrairieLearn. This page has a green "Sync" button which will pull updates from the configured repository.


## Instructions for server administrators

Syncing will be automatically enabled if two conditions are met:

1. The directory pointed to by `courseDir` should be a cloned git repository, with the `origin` fetch remote set to the desired remote repository. This will be automatically enabled if the course directory was created by a command like `git clone git@github.com:PrairieLearn/pl-tam212.git`.

1. The variable `gitCourseBranch` in the course `config.json` should be set to the remote branch to pull from (e.g., `master`).