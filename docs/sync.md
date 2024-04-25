# Editing and syncing course content

All course content in PrairieLearn lives in a [Git](https://git-scm.com/) repository, typically hosted on [GitHub](https://github.com/). That repository is synced to/from PrairieLearn.

![High level system structure](high-level.png)

There are two ways to edit your content: through the in-browser editor in PrairieLearn, and by interacting directly with the repository.

## In-browser editor

If you don't want to set up Docker on your computer and use Git/GitHub directly, you can access and edit all content directly in PrairieLearn via the "Files" tab that appears on supported pages. When you save an edit to a file, your change is automatically synced to your GitHub repository. Note that you must have "Editor" or "Owner" permissions in the course to edit files.

The in-browser editor is great for getting started with PrairieLearn and can work well for managing content with a small number of instructors. However, with a large course staff, you may want to exert more control over changes via software engineering best practices like code reviews or continuous integration. For that, you can use Git and GitHub as discussed in the next section.

## Git/GitHub

Since your course content is a Git repository hosted on GitHub, you can work directly with the underlying repository on your computer. This has a number of benefits:

- You can develop and test content locally without impacting your live questions or assessments.
- You can require code review to ensure that changes are validated by multiple people on your course staff.
- If you wish, you can use continuous integration services to automatically test and validate changes yo your content.

To get started, ensure you have access to your course's repository. You may need to request access from an owner of the repository. Next, follow the [local installation instructions](installing.md) to get PrairieLearn running on your computer. From there, you can edit your course content in your preferred file editor and preview the changes locally.

We recommend the [GitHub flow](https://docs.github.com/en/get-started/quickstart/github-flow): users should clone the course repository, check out a new branch, push their changes to the branch, and open a pull request. Once their changes have been reviewed, approved, and merged, an instructor with "Editor" permissions in the course can navigate to the "Sync" page of the course and sync the changes into PrairieLearn with the "Pull from remote git repository" button. Note that your must have "Editor" or "Owner" permissions in the course to sync the repository.

If you're new to Git, the following resources can help get you started:

- [Git book](https://git-scm.com/book/en/v2)
- [Software Carpentry's git course](https://swcarpentry.github.io/git-novice/)
- [tryGit tutorial](https://try.github.io/)

You can use any Git client you like on your computer. The [`git` CLI](https://git-scm.com/downloads) is available on all platforms. Some popular graphical clients are [GitHub Desktop](https://desktop.github.com) and [SourceTree](https://www.sourcetreeapp.com).
