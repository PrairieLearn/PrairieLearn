# Making the copy

Make the copy first and leave its dates alone. You plan and rewrite them on the
copy itself, so the plan matches whatever access-control format the copy ends
up in.

## Copied in PrairieLearn

If the instructor already used the **Make a copy of this course instance**
button (on the course instance's Settings tab), fetch the course and work on
that copy. The button already does several things:

- gives the copy a new UUID, publishing dates, and enrollment settings
- removes per-student rules
- can migrate access control to the modern format

It does not move assessment dates; this skill does that part.

## Copied by hand

Copy the course instance folder, including `clientFilesCourseInstance`, to a
folder named for the new term in the course's convention. Then, in
`infoCourseInstance.json`:

- Generate a new `uuid` (`python3 -c "import uuid; print(uuid.uuid4())"`) and
  set `longName`. Assessment UUIDs can stay; they only
  need to be unique within a course instance.
- Replace legacy `allowAccess` with `publishing`, using the old rule's start and
  end dates (the plan maps them with everything else).
  - Don't do this for LTI 1.1 courses.
  - If the old rule restricted access by `institution`, carry that into
    `selfEnrollment`. Otherwise students from another campus can't enroll. For
    example, a rule that allowed ZJUI becomes `restrictToInstitution: false`,
    usually with `useEnrollmentCode: true`.
- Remove `shareSourcePublicly`.

## Either way

- Keep the access-control format the copy has. If it's legacy `allowAccess`,
  mention that each assessment's **Access** tab can migrate it.
- Folders PrairieLearn doesn't sync, such as `assessments-not-used/`, come along
  with the copy. Leave them unchanged and mention them.

Docs: [course instances](https://docs.prairielearn.com/courseInstance/),
[access control](https://docs.prairielearn.com/assessment/accessControl/),
[legacy format](https://docs.prairielearn.com/assessment/accessControlLegacy/),
[UUIDs](https://docs.prairielearn.com/uuid/).
