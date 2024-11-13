# LMS integration for instructors

Integrating Learning Management Systems (LMSes) with PrairieLearn uses [LTI 1.3](https://www.1edtech.org/standards/lti) technology to connect LMS courses with PrairieLearn course instances. This allows for programmatic assignment linking and grade passback.

PrairieLearn currently has "Public Preview" support for integration with Learning
Management Systems, starting with Canvas. General availability of Canvas integration
support as well as support for other LMS platforms will be coming in the future.

## Setting up your Canvas course for PrairieLearn

The first step is to enable PrairieLearn in your Canvas course. In your Canvas course,
go to "Settings" in the left-hand menu, then choose the "Navigation" tab and find
PrairieLearn in the list of hidden items. Drag PrairieLearn to the top visible list and
click Save. When the page reloads, you should see PrairieLearn in your Canvas course left menu.

If PrairieLearn is not listed under "Settings" / "Navigation" then it needs to be enabled for your university. Please email support@prairielearn.com to get it set up.

The next step is to setup a connection between the Canvas course and a PrairieLearn course
instance. As a Canvas Teacher, click the PrairieLearn left menu link. You will be presented
a page to select a course instance to link.

If students click the left menu PrairieLearn link before you have connected a course instance,
they will see a 'come back later' message. After a course instance is connected, the link will
take them into your course instance.

## "LTI 1.3" tab in your PrairieLearn course instance

Once a Canvas course is linked with your PrairieLearn course instance, you will see an
"LTI 1.3" tab in the PrairieLearn course instance instructor view. All of the Canvas
integration features are managed from that page.

### Linking assessments

To be able to send grades from PrairieLearn to Canvas, you first need to link the PrairieLearn
assessment with a Canvas assignment. There are two ways to do this:

1. **Create a new Canvas assignment for the PrairieLearn assessment.** In PrairieLearn, go to your course instance and then the "LTI 1.3" tab. Click the "Link assignment" button and then the "Create a new assignment" button. This will create a new Canvas assignment and link it to the PrairieLearn assessment.
2. **Link an existing Canvas assignment.** If you already have a Canvas assignment that you want to link to a PrairieLearn assessment, there is a multi-step procedure:

   1. In PrairieLearn, go to the assessment, then the "Settings" tab, and copy the "Student Link".
   2. In Canvas, go to the Assignments page. Next to your assignment click the three-dots menu and select "Edit". Change the "Submission Type" to "External Tool" and set the "External Tool URL" to the student link that you copied above from PrairieLearn. Check "Load This Tool In A New Tab". Save the assignment changes.
   3. In PrairieLearn, go to your course instance and then the "LTI 1.3" tab. Click the "Link assignment" button and then the "Pick from existing" button. Select the Canvas assignment and click "Link assignment".

### Sending grades from PrairieLearn to Canvas

To send grades you first need to link the PrairieLearn assessment with a Canvas assignment, as described above. After doing this, go to your PrairieLearn assessment, select the "LTI 1.3" tab, and then click "Send grades". Grades are always sent as percentage scores out of 100. These are the percentage "Score" values that PrairieLearn shows on the "Gradebook" page and the "Students" tab inside each assessment. Canvas will scale those percentages to the total points configured in the Canvas assignment.

### Unlinking assessments

You can unlink a single PrairieLearn assessment from Canvas. This can be helpful if you want to link it to a different Canvas assignment. Unlinking does not change any grades in Canvas or PrairieLearn.

To do this, go to your course instance in PrairieLearn, then the "LTI 1.3" tab. For the assessment you want to unlink, select the dropdown arrow on the right of the "Send grades" button and select "Unlink assignment".
