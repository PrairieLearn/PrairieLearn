# LTI 1.3 configuration for instructors

LTI 1.3 requires a trust relationship between the Learning Management System (Canvas) and
PrairieLearn. We will need to set that up with your LMS admin before LTI is available at
the course level.

LTI 1.3 is available in beta. Reach out to support@prairielearn.com to get it set up.

## Setting up your Canvas course for PrairieLearn

In Canvas, if PrairieLearn LTI 1.3 is available for your course, it will be in the list of
items under Settings / Navigation. It's in the hidden list by default. Drag PrairieLearn
to the top visible list and click Save. When the page reloads, you should see PrairieLearn
in your Canvas course left menu.

The next step is to setup a connection between the Canvas course and a PrairieLearn course
instance. As a Canvas Teacher, click the PrairieLearn left menu link. You will be presented
a page to select a course instance to link.

If students click the left menu PrairieLearn link before you have connected a course instance,
they will see a 'come back later' message. After a course instance is connected, the link will
take them into your course instance.

## LTI 1.3 in the course instance

Once a Canvas course is linked with your course instance, you will see an LTI 1.3 tab
in the course instance instructor view. All of the LTI 1.3 features are managed from
that page.

### Linking assessments and sending grades

To be able to push grades from PrairieLearn to Canvas, you need to link the PrairieLearn
assessment with a Canvas assignment. You can either use PrairieLearn to create a new
assignment in Canvas based off the PrairieLearn assessment, or you can poll Canvas for
assignments available to PrairieLearn and pick from pre-existing assignments.

PrairieLearn can only see assignments in Canvas that are associated with PrairieLearn.
To do this in Canvas, edit the assignment Submission Type to "External Tool" and set
the External Tool URL to the students' link to the assessment. (You can get this URL
from the assessment instructor settings page.)

When a PrairieLearn assessment is linked with a Canvas assignment, you will see a
"Send Grades" button. Use this button to manually push grades to Canvas.

### Connection to LMS

You can remove PrairieLearn's connection with that Canvas course from the LTI 1.3
instructor page. This is useful if you want to start over or link the Canvas course
with a different PrairieLearn course instance.

# LTI 1.3 future planning

LTI 1.3 is under active development and beta testing.

Our only currently supported Learning Management System is Canvas. Supporting
additional learning systems will be supported after our first roll out with Canvas.

Sending grades is currently a manual operation for instructors. We will add the
configurable ability for PrairieLearn to push grades continuously so Canvas is
always in sync with PrairieLearn grades.
