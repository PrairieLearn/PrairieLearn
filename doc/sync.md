
# Syncing course content to the live website

The model that PrairieLearn uses for course content is that it is developed on your own local copy of PrairieLearn (see the [running instructions](running.md)) and then pushed to the live website via GitHub.

![High level system structure](high-level.png)

The two steps are:

1. On your local computer, sync or push your course content to GitHub.

2. On the live website at [https://prairielearn.engr.illinois.edu](https://prairielearn.engr.illinois.edu), go to your course, select the "Sync" page in the menu bar, and then click the "Pull from remote git repository” button.

## Sync permissions

The list of users who have permission to sync content to your course is shown on the "Course" page. If you are a course owner then you can add and remove other people. The three levels of course permissions are:

Level | Permissions
--- | ---
Owner | Can sync content and add/remove course permissions for other people.
Editor | Can sync content, but cannot change other people's permissions.
Viewer | Can view course content (questions), but can't sync content.

People must have been logged in to PrairieLearn before you can give them course permissions.

The course permissions are only concerned with sync permissions and access to course-level data (the question pool). To control access to specific course instances you need to add people to the `userRoles` in [`infoCourseInstance.json`](courseInstance.md).

## Version control with git

PrairieLearn treats your course content as *source code*, and encourages your to develop it with the full power of git as a [version control system](https://en.wikipedia.org/wiki/Version_control).

Some good resources for learning about git are:

* [Git book](https://git-scm.com/book/en/v2)
* [Software Carpentry's git course](https://swcarpentry.github.io/git-novice/)
* [tryGit tutorial](https://try.github.io/)

You can use any git client you like on your local machine. The [commandline git interface](https://git-scm.com/downloads) is available on all platforms. Some popular graphical clients are [GitHub Desktop](https://desktop.github.com), [TortoiseGit](https://tortoisegit.org), and [SourceTree](https://www.sourcetreeapp.com).
