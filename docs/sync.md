# Syncing course content to the live website

The model that PrairieLearn uses for course content is that it is developed on your own local copy of PrairieLearn (see the [Installing page](installing.md)) and then pushed to the live website via GitHub.

![High level system structure](high-level.png)

The two steps are:

1. On your local computer, sync or push your course content to GitHub.

2. On the live website at [https://us.prairielearn.com](https://us.prairielearn.com), go to your course, select the "Sync" page in the menu bar, and then click the "Pull from remote git repository” button.

## Course admin permissions

PrairieLearn controls administrative access to a course and course instance in two distinct places. These are controlled independently to provide flexible access to questions and student data.

### Course-level access

Course level permissions control the ability to view, edit, and sync course content from GitHub to the production server. These settings are made via the Course / Access page on the production server.

The Course / Access page lists who has which course access role, and gives Owners the ability to add a new user/role setting.

| Level  | Permissions                                                                                |
| ------ | ------------------------------------------------------------------------------------------ |
| Owner  | Can sync content, edit in the browser, and add/remove course permissions for other people. |
| Editor | Can sync content, edit in the browser, but cannot change other people's permissions.       |
| Viewer | Can view course level content (questions and issues), but can't edit or sync content.      |

People must have been logged in to PrairieLearn before they can be given course permissions.

Course level access only enables access to Questions and their related issues. Access to course instance data is
controlled separately.

For completeness, users with roles assigned in courseInstances should probably also be given at least Viewer course level access, but this is not required. A user could have View access with no courseInstance access to see the questions but none of the semester data.

### Course instance-level access

Course instances, with assessments and student results, have their access controlled separately from course-level editing and viewing. To control access to specific course instances you need to add people to the `userRoles` in [`infoCourseInstance.json`](courseInstance.md), and sync with the server.

## Version control with git

PrairieLearn treats your course content as _source code_, and encourages your to develop it with the full power of git as a [version control system](https://en.wikipedia.org/wiki/Version_control).

Some good resources for learning about git are:

- [Git book](https://git-scm.com/book/en/v2)
- [Software Carpentry's git course](https://swcarpentry.github.io/git-novice/)
- [tryGit tutorial](https://try.github.io/)

You can use any git client you like on your local machine. The [commandline git interface](https://git-scm.com/downloads) is available on all platforms. Some popular graphical clients are [GitHub Desktop](https://desktop.github.com), [TortoiseGit](https://tortoisegit.org), and [SourceTree](https://www.sourcetreeapp.com).
