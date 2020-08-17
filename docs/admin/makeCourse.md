
# Admin: Creating new courses

This documents the procedure to make a new PL course for `CS 101` at the University of Illinois (abbreviation `UIUC`) on the production server at https://prairielearn.engr.illinois.edu. The names for the course, institution, and server should be adjusted as appropriate.


## Get the required GitHub usernames

Ask the course instructor for their GitHub username (have them make an account at https://github.com if necessary) and their PrairieLearn UID (they need to login to PL at least once to create this).


## Create the `pl-uiuc-cs101` GitHub repository

Go to the main PrairieLearn GitHub organization: https://github.com/PrairieLearn

Make sure you are on the `Repositories` tab and click `New` to make a new repository with settings:

* Repository template: `PrairieLearn/pl-template`
* Repository name: `pl-uiuc-cs101`
* Description: leave blank
* Privacy: select `Private`

## Update the `infoCourse.json` file
In the web editor (or clone locally), edit the `infoCourse.json` file and update the following fields:
* `uuid` - Generate locally with `uuidgen` or use https://www.uuidgenerator.net/
* `name` - The short name of the course (`CS 101`)
* `title` - The official title of the course (`Temp`)

## Give the instructor Admin access to the repo (optional)
Skip this step if the instructor didn't give or doesn't have a GitHub username.

* Go to the repository page on GitHub (e.g., https://github.com/PrairieLearn/pl-uiuc-cs101)
* Click "Settings"
* Click "Collaborators & teams"
* Use the "Collaborators" panel to add the instructor
* Change their access level to "Admin"

This allows them to add other instructors and TAs.


## Give the `machine` team access to the repo

The `machine` team gives the production PL servers read/write access to the course repositories so the servers can sync.

* Go to the repo page on GitHub
* Click "Settings"
* Click "Collaborators & teams"
* In the "Teams" panel, click "Add a team" and add the "machine" team
* Change the permission level from "Read" to "Admin"


## Give the `uiuc-admin` team access to the repo

The `uiuc-admin` team is 

* Go to the repo page on GitHub
* Click "Settings"
* Click "Collaborators & teams"
* In the "Teams" panel, click "Add a team" and add the "uiuc-admin" team
* Change the permission level from "Read" to "Admin"


## Deploy the new course to the production server

Go to https://prairielearn.engr.illinois.edu

Select the `Admin` tab, scroll down to the `Courses` list, click `Add new course`, and use:

* Short name: `CS 101`
* Title: `Temp`
* Timezone: `America/Chicago` (or something else from https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
* Path: `/data1/courses/pl-uiuc-cs101`
* Repository: `git@github.com:PrairieLearn/pl-uiuc-cs101.git`

Go back to the main PrairieLearn course list and select the new course.

Under `Course access roles`, click `Add new user` and use:

* UID: the course instructor's PrairieLearn UID (this should look something like `mwest@illinois.edu`).
* Course role: `Owner`

After course content has been added (questions, course instances, etc), the course will need to be synced for the first time. To do this, select the `Sync` tab and click `Pull from remote git repository` to do an initial deployment. This can be done later by the instructor.


## Add the course instructor to the `prairielearn-announce` email list

Go to https://lists.illinois.edu/lists/info/prairielearn-announce

Login in the top-right of the page

Click `Admin` in the left sidebar

Click `Manage Subscribers` on the top menu

Use the `Add a user` field to add the course instructor and any TAs who are creating content.


## Add the course instructor to Slack

In Slack, go to the main menu (the top-left PrairieLearn dropdown) and select `Invite people`.

Add the course instructor and any TAs who are creating content.


## Send the course instructor an email

Edit the `pl-uiuc-cs101` text in the repository URL in the template:

```text
Your PrairieLearn course has been created.

Your GitHub course repository is at: https://github.com/PrairieLearn/pl-uiuc-cs101

The live website is at: https://prairielearn.engr.illinois.edu

PrairieLearn documentation is at: http://prairielearn.readthedocs.io/

You have been signed up for the prairielearn-announce mailing list: https://lists.illinois.edu/lists/info/prairielearn-announce

You have been invited to the PrairieLearn Slack group and should have received an email with this invite.

Help is available for PrairieLearn at the weekly in-person office hours and online in the Slack #pl-help channel.
```
