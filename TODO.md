On the 'sharing' page:

- [x] let you declare your course 'slug' or 'sharing name' or whatever we want to call it.
- [x] access your code to let someone else share their questions with you
- [x] create a new 'sharing set'
- [x] share a 'sharing set' to a particular course
- [] auto generate sharing UUID the first time this page is visited
- [] disallow changing the sharing id once set

On the settings page for each question:

- [x] add the question to a sharing set

When trying to access a question:

- [] Fix the hack I put in before, make sure it works for shared and non-shared questions
- [] Check if course elements/clientFiles/serverFiles, etc. work as expected!
- [] Give access denied! for the endpoints for all Tabs except the 'Preview' tab (meaning the Files, Settings, and Statistics pages should all give 404)

Fill out the new documentation page!

- [x] what is a sharing set? and why do we want them?

Funcitonality to test!!!

- [] disallow duplicate sharing set names, with a good error message
- [] disallow adding the same course to be shared with again (probably don't need an error message?)
- [] sharing permissions deleted properly

To discuss with Matt/Nathan:

- [] rules for sharing names? no spaces? no @ at the begining? (@@ would look weird). Maybe just say it must start with an alphabetic or alphanumeric character? upper and/or lower case?
- [] Special case to silently fail question imports when running in local dev. What config flag do I use? Need to have a seperate one than the one for enabling question sharing?
- [] What should the settings page look like for imported questions? There are somethings that it would be good to be able to see, like the 'Tags' and 'Tests' but most of the rest of it should NOT be seen. I think for now we should just hide the tab entirely, worry about details later
  with assessments from the consuming course rather than from the sharing course
- [] User interface of 'Add...' button on question settings page when there are no sharing sets to show there. Have a 'create new' button with a text box right there? or link to the other page for now?
- [] do we have a good way for testing different config options in the unit tests?
- [] if sharing is not enabled for a course, should we show the tab? what should we show on direct access to URL? An error page? or a page saying you need it enabled? What has worked for manual grading?
- [] should we still have a server-level flag now that we have one for each course?

Deployment considerations

- [x] Special case to only enable the feature on the main (Illinois) server!!! Use a config flag!
