---
name: share-course-content
description: Share PrairieLearn questions, assessments, or course instances with other courses or publicly, stop sharing them, or use questions another course shared. Use for requests such as "Share these questions with Prof. Lee's course", "Make this homework public", or "Add CS 357's question to our quiz".
---

# Share course content

Share exactly what the instructor means, with the mechanism that fits who should
get it. Don't publish exam content or take an irreversible step without saying
so first. PrairieLearn's [content sharing
docs](https://docs.prairielearn.com/contentSharing/) are the reference.

## Know the options

| To share                                                         | With             | Set                                                                                                                                                                                                | Undo?                                   |
| ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A question, for use by reference (`@sharing-name/qid`)           | anyone           | `"sharePublicly": true` in `info.json`                                                                                                                                                             | No, once another course uses it         |
| A question's source, to view and copy                            | anyone           | `"shareSourcePublicly": true` in `info.json`                                                                                                                                                       | Yes                                     |
| A question, for use by reference                                 | specific courses | a sharing set: listed in `infoCourse.json` `sharingSets` and in the question's `sharingSets`; a course owner adds each consuming course on the **Sharing** page, using that course's sharing token | No, once that course uses it            |
| An assessment, to view (others copy its questions one at a time) | anyone           | `"shareSourcePublicly": true` in `infoAssessment.json`, after every question in it is shared publicly                                                                                              | Yes, but its questions must stay shared |
| A course instance, to copy in one step                           | anyone           | `"shareSourcePublicly": true` in `infoCourseInstance.json`, after every assessment in it is shared                                                                                                 | Yes                                     |

Requirements:

- sharing must be enabled for the course (a beta flag, which PrairieLearn admins
  enable on request)
- the course needs a sharing name, which a course owner chooses on the
  **Sharing** page; it can't change once anything is shared
- draft and non-v3 questions can't be shared; sync rejects them
- questions that use `clientFilesCourse`, or instance- or assessment-level
  files, sync fine but break in other courses

Shared content is published under a Creative Commons license (CC BY-NC-ND for
reference sharing, CC BY-NC for source sharing).

Another course can use shared content by **reference** (it stays maintained by
the source course and can't be edited) or by **copy** ("Make a copy" on the
question's Settings page; editable, records `copiedFrom`, gets no later fixes).

## Exercise judgment

- **Choose by audience and use.** Named colleagues get a sharing set. "Anyone
  can adopt it" gets source sharing, which can be undone. Use `sharePublicly`
  when others need a live reference, or when an assessment or course instance
  must keep referring to your copy. Ask when the request doesn't say who.
- **Say what can't be undone before doing it.** After another course uses a
  question shared by reference or in a set, the question can't be renamed,
  deleted, unshared, or removed from its set; a sync that tries fails entirely.
- **Treat assessed content as sensitive.** Before publishing, find every
  assessment, in any course instance, that uses each question (search
  `courseInstances/*/assessments` for its QID). Flag exams,
  quizzes and finals, especially ones that are open or haven't run yet. Source
  sharing also exposes answers, `server.py`, tests, `clientFilesQuestion`, and
  any secrets in those files, such as API keys; flag secrets so they can be
  removed and rotated. Make the safe choice your default (leave out the exam
  questions, or wait until after the term). A general "go ahead" doesn't
  confirm publishing assessed content: ask about it by name until the
  instructor answers.
- **Check before unsharing.** If another course uses a question, unsharing it is
  blocked. Turning off source sharing is allowed. Say what is and isn't
  possible instead of editing until sync fails.

## Do it

1. **Resolve the scope.** Name the exact questions, assessments, or course
   instance, by PrairieLearn title and directory. List candidates when the
   request is ambiguous. Then add what sharing needs: every question in a
   shared assessment, and every assessment and question in a shared course
   instance.
2. **Check each item** against the requirements and the judgment points above.
   You can't see whether sharing is enabled or whether the course has a sharing
   name. Content that is already shared shows both are in place. Otherwise ask
   the instructor to check the course's **Sharing** page.
3. **Review once.** Before editing, give the instructor:
   - what will be shared and how
   - what can't be shared
   - what will be locked once used
   - the exam-use flags
   - the license
   - the owner-only steps

   Wait for a yes if anything is irreversible or assessed; otherwise proceed.

4. **Apply.** Edit only the sharing fields, keeping each file's formatting,
   and submit the edits for review. PrairieLearn syncs the course when they are
   approved, and sync rejects the whole course if any sharing rule is broken.
   If the sync fails, fix every sharing error and submit again.
5. **Verify.** You can't open PrairieLearn pages, so give the instructor the
   pages to check once the course has synced:
   - `/pl/public/course/<course_id>/questions`
   - `/pl/public/course/<course_id>/question/<question_id>/preview`
   - `/pl/public/course_instance/<course_instance_id>/assessments`
   - for a reference, the question's preview in the consuming assessment

   The course's ID is in the path of the page the instructor is viewing.

## Use another course's question

Add it to the assessment as `@<sharing-name>/<qid>`, which the other course's
instructor provides. Its files aren't in this checkout, so you can't read or
edit it. If the course needs to change it, the instructor copies it with
**Make a copy** on the question's Settings page, and the copy gets no later
fixes.

## Hand off

- What is shared, how, and the links or `@sharing-name/qid` references to send.
- Owner-only steps still needed:
  - choose a sharing name
  - get the other course's sharing token, and add that course to the set
  - request the beta flag
- What is now locked once used, and what can still be undone.
- What to check in PrairieLearn, and anything else you couldn't verify.
