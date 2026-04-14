# LMS integration for instructors

PrairieLearn can connect to Learning Management Systems (LMSes) using [LTI 1.3](https://www.1edtech.org/standards/lti) technology. This allows for assignment linking and grade syncing.

PrairieLearn LTI 1.3 integration is primarily designed and documented for Canvas. Support for other LMS platforms will be coming in the future.

## Make sure you have the right permissions

Linking a PrairieLearn course instance with a Canvas course requires the following permissions:

- Canvas
  - Teacher or Designer
- PrairieLearn Course
  - Editor
- PrairieLearn Course Instance
  - [Student Data Editor](course/index.md#course-staff)

To check this, in PrairieLearn go to the "Staff" tab and make sure that the "Student data access" column has an "Editor" badge for the appropriate course instance, in the row corresponding to your name. If you don't have Student Data Editor permission, add this or ask the course owner to do so.

## Setting up your Canvas course for PrairieLearn

The first step is to enable PrairieLearn in your Canvas course. In your Canvas course,
go to "Settings" in the left-hand menu, then choose the "Navigation" tab and find
PrairieLearn in the list of hidden items. Drag PrairieLearn to the top visible list and
click Save. When the page reloads, you should see PrairieLearn in your Canvas course left menu.

!!! note

    If PrairieLearn does not appear under Settings → Navigation in your Canvas course:

    1. Confirm you have a Teacher or Designer role (only these roles can enable navigation items).
    2. Check with a Canvas administrator that the PrairieLearn LTI 1.3 tool has been configured at your institution.
      - If it is already installed, the admin may still need to enable or expose the tool for your sub‑account or specifically for your course so it appears in Navigation.
      - If it has never been installed, a Canvas administrator must coordinate installation with the PrairieLearn team.
    3. After installation/enabling, revisit Settings → Navigation to move PrairieLearn into the active (visible) list and Save.

    Canvas administrators who need to configure the integration can contact <support@prairielearn.com>.

The next step is to set up a connection between the Canvas course and a PrairieLearn course
instance. As a Canvas Teacher, click the PrairieLearn left menu link. You will be presented
a page to select a course instance to link.

If students click the left menu PrairieLearn link before you have connected a course instance,
they will see a 'come back later' message. After a course instance is connected, the link will
take them into your course instance.

Canvas courses must be "Published" for certain integration functionality, like grade reporting, to work.

## "LMS connections" tab in your PrairieLearn course instance

Use the "LMS connections" tab in your course instance to manage all LMS connections.

### Linking assessments

To be able to send grades from PrairieLearn to Canvas, you first need to link the PrairieLearn
assessment with a Canvas assignment. There are two ways to do this:

1. **Create a new Canvas assignment for the PrairieLearn assessment.** In PrairieLearn, go to your course instance and then the "LMS connections" tab. Click the "Link assignment" button and then the "Create a new assignment" button. This will create a new Canvas assignment and link it to the PrairieLearn assessment.
2. **Link an existing Canvas assignment.** If you already have a Canvas assignment that you want to link to a PrairieLearn assessment, there is a multistep procedure:
   1. In PrairieLearn, go to the assessment, then the "Settings" tab, and copy the "Student link".
   2. In Canvas, go to the Assignments page. Next to your assignment click the three-dots menu and select "Edit". Change the "Submission Type" to "External Tool" and set the "External Tool URL" to the student link that you copied above from PrairieLearn. Check "Load This Tool In A New Tab". Save the assignment changes.
   3. In PrairieLearn, go to your course instance and then the "LMS connections" tab. Click the "Link assignment" button and then the "Pick from existing" button. Select the Canvas assignment and click "Link assignment".

### Sending grades from PrairieLearn to Canvas

To send grades you first need to link the PrairieLearn assessment with a Canvas assignment, as described above. After doing this, go to your course instance's "LMS connections" tab, and then click "Send grades" for the linked assessment. Grades are always sent as percentage scores out of 100. These are the percentage "Score" values that PrairieLearn shows on the "Gradebook" page and the "Students" tab inside each assessment. Canvas will scale those percentages to the total points configured in the Canvas assignment.

If you receive errors about students not being found in the course, check that your Canvas course is published before sending grades.

### Unlinking assessments

You can unlink a single PrairieLearn assessment from Canvas. This can be helpful if you want to link it to a different Canvas assignment. Unlinking does not change any grades in Canvas or PrairieLearn.

To do this, go to your course instance in PrairieLearn, then the "LMS connections" tab. For the assessment you want to unlink, select the dropdown arrow on the right of the "Send grades" button and select "Unlink assignment".

## Exporting Canvas-compatible CSV files

If your institution does not use LTI 1.3, or if you prefer to upload grades manually, PrairieLearn can generate CSV files formatted for Canvas's gradebook import. These CSV files include the column headers and "Points Possible" row that Canvas expects.

Canvas CSV exports are available from two places:

- **Gradebook page** — export scores for multiple assessments at once.
- **Assessment Downloads page** — export scores or points for a single assessment.

### Matching PrairieLearn students to Canvas students

By default, the CSV export uses each student's PrairieLearn sign-in identifier in the column Canvas uses for login IDs from your student information system. If those identifiers differ between PrairieLearn and Canvas, the import into Canvas will fail to match students correctly.

To fix this, you can upload a gradebook CSV exported from Canvas so that PrairieLearn can match students and fill in the identity columns from that file with the exact values Canvas expects.

#### How to export a gradebook from Canvas

1. In your Canvas course, go to **Grades**.
2. Click **Export** (or **Export Entire Gradebook**) to download a CSV file.
3. Save this file — you will upload it into PrairieLearn in the next step.

#### Using the Canvas matching feature

1. Open the Canvas CSV export dialog in PrairieLearn (from either the Gradebook page or the Assessment Downloads page).
2. In the **Canvas gradebook import** section, upload the CSV file you exported from Canvas.
3. PrairieLearn will automatically try several matching strategies and select the best one. You can hover over the tooltip icon next to each strategy to learn how it works.
   - **Sign-in identifier match** — the PrairieLearn sign-in identifier is compared against both the SIS Login ID and SIS User ID columns in the Canvas export.
   - **Campus student ID match** — PrairieLearn's stored student ID is compared against both the SIS User ID and SIS Login ID columns in the Canvas export. This handles institutions that place the campus student ID in either column.
   - **Name-based match** — student names are compared across different formats (e.g., "Last, First" vs "First Last").

   Strategies that produce no matches are automatically disabled. If a strategy matches all PrairieLearn students without ambiguity, other strategies are disabled as well.

4. A summary shows how many students were matched, how many are ambiguous, and how many are unmatched.
5. If any matches are ambiguous (one PrairieLearn student matched multiple Canvas students), you can manually select the correct Canvas student from a dropdown.
6. Click **Download** to generate the CSV with the matched Canvas identity columns.

!!! note

    - Unmatched PrairieLearn students will still appear in the export using their PrairieLearn sign-in identifier in the login column.
    - Unmatched Canvas students may be omitted from the export because no matching PrairieLearn account was found.
    - The matching step is optional — you can always download without uploading a Canvas CSV.
