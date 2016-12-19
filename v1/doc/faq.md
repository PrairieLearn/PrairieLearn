
# Troubleshooting and other questions


## My changes to a test don't show up

There are a couple actions needed to activate changes to tests while in development mode on your local computer:

1. Make sure the test changes are really saved to disk in the course directory that PrairieLearn is using.

1. Reload the server by clicking the 'Reload' button in the header. (Note that this will reset all test data for the current user.)

On the production server you only need to sync the new test code (on the "Sync" page). If you want existing test instances to be updated with the new code then you will need to reset the test (**but this will remove all existing progress by students on that test**).

## I changed a question but the changes aren't showing up

When you change a question it only affects newly-generated variants of the question. To make sure you are getting the new version of a question on your local computer:

1. Make sure the question changes are really saved to disk in the course directory that PrairieLearn is using.

1. Reload the server (Ctrl-C in the server window, then re-run `node server`).

1. Reload the PrairieLearn webpage in your browser.

1. If this is a "homework"-type style test then you should get the question wrong and click "Do this question again" to prompt the generation of a new question variant.

1. If this is an "exam"-style test then, you can click the "Reload" button in the header to have PrairieLearn regenerate the question. (Note that this will reset all test data for the current user.)

On the production server you only need to sync the new question code (on the "Sync" page), and then force a regeneration of the question variant as described above.


## How do I reset a test for a particular student?

The "Admin" page for each test allows you to reset a test for all users or for the current user. To reset a test for a particular student, first use the "User" page to change your the active user to the particular student, make sure you are still in the "Instructor" role, then go back to the test "Admin" page and click "Reset for current user". **Be very careful resetting tests after students have started working on them. Resetting will remove all progress by that student.**


## How do I view PrairieLearn errors?

PrairieLearn errors are output in different places depending on where the error occurs:

* Server-side errors are output in the terminal window where you ran `node server`. Extra debugging information can be output here by adding `console.log()` statements inside question `server.js` files.

* Client-side errors are output in the JavaScript console inside your web browser. In Chrome, this can be accessed from the menu item *View → Developer → JavaScript Console*. Additional debugging information can be output here with `console.log()` from within question `client.js` files.
