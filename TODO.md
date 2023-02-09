On the 'sharing' page:

- [x] let you declare your course 'slug' or 'sharing name' or whatever we want to call it.
- [x] access your code to let someone else share their questions with you
- [x] create a new 'sharing set'
- [x] share a 'sharing set' to a particular course
- [x] auto generate sharing UUID the first time this page is visited
- [] disallow changing the sharing id once set (don't allow an UI element for it, throw a SQL exception on a failed update)

On the settings page for each question:

- [x] add the question to a sharing set
- [] FIX BUG where sharing sets are showing up for all questoins, not just the question they were added to (some join error or something?)

Authorization Stuff

- [] Fix the hack I put in before, make sure it works for shared and non-shared questions
- [] Check if course elements/clientFiles/serverFiles, etc. work as expected!
- [] Give access denied! for the endpoints for all Tabs except the 'Preview' tab (meaning the Files, Settings, and Statistics pages should all give 404)
- [] Check if
- [] When the Question instance is created, it should live under the course id of the consuming course, right? But the question id in that row still refers to a question from another course

Fill out the new documentation page!

- [x] what is a sharing set? and why do we want them?

Funcitonality to test!!!

- [x] disallow duplicate sharing set names, with a good error message
- [x] disallow adding the same course to be shared with again (probably don't need an error message?)

To discuss with Matt/Nathan:

- [] rules for sharing names? no spaces? no @ at the begining? (@@ would look weird). Maybe just say it must start with an alphabetic or alphanumeric character? upper and/or lower case?
- [] Special case to silently fail question imports when running in local dev. What config flag do I use? Need to have a seperate one than the one for enabling question sharing?
- [] What should the settings page look like for imported questions? There are somethings that it would be good to be able to see, like the 'Tags' and 'Tests' but most of the rest of it should NOT be seen. I think for now we should just hide the tab entirely, worry about details later
  with assessments from the consuming course rather than from the sharing course
- [] User interface of 'Add...' button on question settings page when there are no sharing sets to show there. Have a 'create new' button with a text box right there? or link to the other page for now?
- [] if sharing is not enabled for a course, should we show the tab? what should we show on direct access to URL? An error page? or a page saying you need it enabled? What has worked for manual grading?
- [] should we still have a server-level flag now that we have one for each course?
- []  how the HECK does all of this authz stuff work? there are like a million authz files, what is doing what, and what should I be editing? It seems like I need to mess with auth when an instructor is looking at a question preview. In all other situatoins, an instance has already been taken, and as such, everthing works as expected? (with the possible exception of client/server files and custom course elements)
- [] should I add 'This cannot be undone!' error messages?

- [x] Special case to only enable the feature on the main (Illinois) server!!! Use a config flag!
