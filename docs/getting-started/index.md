# Getting started

This guide walks you through the process of creating your first course instance and assessment in the browser.

If you're brand-new to PrairieLearn, consider reading the [Concepts](../concepts/index.md) page first — this guide assumes you know what a course, course instance, assessment, and question are.

!!! tip "Course content is stored in a Git repository"

    PrairieLearn stores all of your course content in a **Git repository**. This means that course configuration files (questions, assessments, course staff, etc.) can be managed as files on disk, which can be beneficial for larger course staffs. See [editing and syncing](../sync.md) and [local installation](../installing.md) for more information.

Before you start, you need a PrairieLearn course space. If you don't have one yet, [request a course](../requestCourse/index.md). When approved, you'll get Owner permissions on the course in PrairieLearn. If you provided your GitHub account in your request, you will also get access to the GitHub repository for your course content.

## 1. Open your course

Sign in at [https://us.prairielearn.com](https://us.prairielearn.com) (or your institution's PrairieLearn instance). Your course appears under **Courses with instructor access** on the home page.

![PrairieLearn home page with the courses panel](screenshots/01-home.png)

Click the course name to open it. You will land on the **Course instances** page.

![Course landing page showing the Course instances tab and sidebar](screenshots/02-course-instances.png)

The sidebar splits into two scopes:

- **Course** (top): everything that lives across all terms — questions, course-wide settings, the question bank, course staff.
- **Course instance** (bottom): one term's offering — assessments, gradebook, students, LMS connections.

## 2. Create a course instance

A course instance is one offering of the course — for example, "Fall 2025." From **Course instances**, click **Add course instance**.

![Create course instance dialog](screenshots/04-create-course-instance.png)

Fill in:

- **Long name** — what students see (e.g., `Fall 2025`).
- **Short name** — a directory-safe identifier (e.g., `Fa25`). No spaces.
- **Publishing settings** — leave **Unpublished** while you build. You'll publish in step 10.
- **Self-enrollment settings** — leave the defaults if you'll share an enrollment link with students; uncheck if you'll add students manually or via LMS. See [enrollment controls](../courseInstance/index.md#enrollment-controls) for the full set of options.
- **Course instance permissions** — pick **Student data editor** if you want to view/edit grades from this course instance. (You can change this later from the Staff tab.)

Click **Create**. You're now inside the new course instance.

!!! tip "Reusing a previous semester"

    To clone a previous instance with all its assessments, instead of clicking on "Add course instance", open the previous instance you want to copy, go to **Instance settings → Settings**, and scroll to **Make a copy of this course instance**. You'll have the option to edit dates and any new assessments, but the structure is preserved.

## 3. Add your course staff

If you have TAs or co-instructors, invite them now. Go to **Staff** in the **Course** sidebar.

![Staff page with Add users button](screenshots/03-staff.png)

Click **Add users** and invite by UID (typically an email-like identification). Then specify the access provided to your staff.

Course content access refers to the ability to see and author course content. The most common roles used here are:

- **Editor** — can create and modify questions and assessments. This is designed for co-instructors and TAs responsible for managing course content.
- **Viewer** — can see questions and assessments, but not modify them. This is designed for TAs that provide other supporting roles, or course observers.

Course instance access refers to access to student data. Staff members may be given the following roles for each instance:

- **Student data editor** — can view and modify student data (such as enrollment status and grades) on this course instance. TAs responsible for grading must be given this role.
- **Student data viewer** — can view student data on this course instance, but not modify. This may be used for TAs that are not involved in grading.

See [course staff](../course/index.md#course-staff) for the full breakdown and recommended roles.

## 4. Build your first question

In the **Course** sidebar, click **Questions**.

![Questions list — a populated course; yours will start empty](screenshots/06-questions.png)

(Yours will be empty — the screenshot shows a populated course so you can see the layout.) Click **Add question**. We highly recommend starting with a template, but for this tutorial, we will start from an empty question.

![Add question form with template tabs and a list of basic question templates](screenshots/07-create-question.png)

Name it `Find the area of a rectangle`, set the **QID** to `rectangle-area`, choose **Empty question**, and then click **Create question**.

You will land on the question's **Files** tab.

![Files tab for a question showing README.md, info.json, question.html, server.py](screenshots/09-question-files.png)

Click **Edit** next to `question.html` and replace the contents with:

```html title="question.html"
<pl-question-panel>
  <p>What is the area of a rectangle that has sides 4 and 5?</p>
</pl-question-panel>

<pl-multiple-choice answers-name="area">
  <pl-answer correct="true">20</pl-answer>
  <pl-answer correct="false">10</pl-answer>
  <pl-answer correct="false">9</pl-answer>
  <pl-answer correct="false">18</pl-answer>
  <pl-answer correct="false">40</pl-answer>
</pl-multiple-choice>
```

[`pl-multiple-choice`](../elements/pl-multiple-choice.md) is one of PrairieLearn's [submission elements](../elements/index.md#submission-elements) — the inputs students interact with. The [element catalog](../elements/index.md) lists every element you can use here.

![Browser file editor for question.html with syntax highlighting and a Save button](screenshots/10-question-editor.png)

Click **Save**, then click the **Preview** tab.

![Question preview after answering 20 and clicking Save & Grade; the submission panel shows a Correct! badge and the staff information sidebar is visible](screenshots/08-question-preview.png)

Select an option and click **Save & Grade**.

!!! tip "Randomization is recommended"

    Although the question above provides the options in a random order, the question always provides the same set of options. You are encouraged to introduce randomization in all auto-graded questions where possible.

## 5. Add randomization with `server.py`

A question's [`server.py`](../question/server.md) generates random parameters per student and (optionally) custom-grades responses. Go back to **Files** and edit `server.py`:

```python title="server.py"
import random

def generate(data):
    a = random.randint(2, 5)
    b = random.randint(11, 19)

    data["params"]["a"] = a
    data["params"]["b"] = b

    data["params"]["distractor1"] = (a * b) / 2
    data["params"]["distractor2"] = 2 * (a * b)
    data["params"]["distractor3"] = 2 * (a + b)
    data["params"]["distractor4"] = a + b

    data["params"]["truearea"] = a * b
```

Go back to **Files** and again edit `question.html`, now with the templated version:

```html title="question.html"
<pl-question-panel>
  <p>What is the area of a rectangle that has sides {{params.a}} and {{params.b}}?</p>
</pl-question-panel>

<pl-multiple-choice answers-name="area">
  <pl-answer correct="true">{{params.truearea}}</pl-answer>
  <pl-answer correct="false">{{params.distractor1}}</pl-answer>
  <pl-answer correct="false">{{params.distractor2}}</pl-answer>
  <pl-answer correct="false">{{params.distractor3}}</pl-answer>
  <pl-answer correct="false">{{params.distractor4}}</pl-answer>
</pl-multiple-choice>
```

Save and preview. Click **New variant** to see the values change. Each student now gets a different version of this question.

!!! tip "You don't need to write every question from scratch"

    The **Add question** form leads with a gallery of templates organized into three categories — **Basic questions** (hardcoded prompts and answers), **Intermediate questions** (built-in randomization without Python), and **Advanced questions** (Python-powered randomization). After picking a template, you'll land in the **Files** tab with a working `question.html` (and `server.py` if applicable) ready to edit.

    ![Add question form with the PrairieLearn template gallery showing Basic, Intermediate, and Advanced template cards](screenshots/11-question-templates.png)

    For something more specific, browse [**XC 101: Example Course**](https://us.prairielearn.com/pl/course/108/), which ships with 200+ ready-to-copy questions covering every element and grading style. To copy one into your course:

    1. Open [XC 101](https://us.prairielearn.com/pl/course/108/) and find a question (the **Course instance → SectionA** has assessments that group questions by topic, e.g. "Question gallery for PL elements").
    2. Open the question's **Preview** tab and click **Copy question** in the top-right.
    3. Pick your course as the destination and submit.

    You're now editing a copy inside your own course. Rename the QID and tweak as needed.

## 6. Create your first assessment

Switch to your course instance (sidebar → **Course instance**) and click **Assessments**.

![Assessments list with Add assessment button](screenshots/05-assessments.png)

Click **Add assessment**.

![Create assessment dialog with Title, Short name, Type (Homework/Exam), Set fields](screenshots/17-create-assessment.png)

Fill in:

- **Title** — student-visible (e.g., `Geometric properties and applications`).
- **Short name** — directory identifier (e.g., `homework1`).
- **Type** — **Homework** for formative practice with unlimited retries; **Exam** for graded assessments with limited attempts. The type cannot be changed later.
- **Set** — pick from `Homework`, `Quiz`, `Exam`, etc. The set is purely organizational; it doesn't change behavior.

Click **Create**. You land on the assessment with empty zones.

## 7. Add questions to the assessment

Go to the assessment's **Questions** tab and click **Edit**. Click **Add zone** to create a zone, then click **Add question** at the bottom of the zone, search for `rectangle-area`, and pick the matching result.

![Question picker with rectangle-area searched and the result highlighted](screenshots/21-question-picker.png)

After clicking the result, the question is added to the zone:

![Assessment Questions tab in edit mode with rectangle-area in the zone](screenshots/19-assessment-edit-mode.png)

Set the point value if you want, then click **Save**.

## 8. Configure assessment access rules

Open the assessment's **Access** tab. In **Defaults**, click **Edit**. In **Date control**, choose **Scheduled for release**, set the release date/time when students may start, choose **Due on date**, set the due date/time, and keep the due-date credit at 100%. Click **Save**.

The **Access** tab summarizes the release window and due-date credit:

![Assessment Access tab showing modern access control defaults](screenshots/12-assessment-access.png)

For late credit, time limits, student-specific overrides, exam mode, and PrairieTest integration, see the [assessment access control documentation](../assessment/accessControl.md).

## 9. Preview as a student

Before sharing anything with students, dry-run the assessment yourself. Open the user menu (top right) and pick **Student view without access restrictions**.

![Dev User dropdown showing Staff view, Student view, Student view without access restrictions](screenshots/13-student-view-menu.png)

You see exactly what a student sees, plus a yellow **Regenerate your assessment instance** banner only staff can see:

![Student view of an assessment with question list and points; the Regenerate your assessment instance banner is highlighted](screenshots/14-student-assessment.png)

!!! warning "Regenerate after editing"

    Whenever you change an assessment's questions, points, or zones, your existing dry-run instance is **stale** — it was built from the old configuration. Click **Regenerate your assessment instance** to discard it and pick up your edits. Students don't have this option — if a real student needs a fresh instance after you've made changes, staff must regenerate it for them.

Click into a question to see how it renders for a student:

![Student view of a single question with Save & Grade and Save only buttons](screenshots/15-student-question.png)

Switch back to staff view from the same dropdown when you're done.

## 10. Publish and enroll students

Go to **Instance settings → Publishing**.

![Publishing settings with Unpublished/Scheduled/Published radio buttons, end date, and Extensions section](screenshots/16-publishing.png)

Pick **Published** to make the course instance available to students, and then hit **Save**. You can read more about publishing in the [course instance documentation](../courseInstance/index.md#publishing-controls).

To get students in, you can share the enrollment link from **Instance settings → Self-enrollment**. Students click the link and enroll themselves. See [enrollment controls](../courseInstance/index.md#enrollment-controls) for codes, institution restrictions, and disabling self-enrollment after a deadline.

## Next steps

You now have a working course instance with a published assessment :partying_face:. From here, head to the [instructor guide](../instructor-guide/index.md) for reference material on every PrairieLearn feature.
