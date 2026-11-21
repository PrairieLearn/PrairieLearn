---
name: share-course-content
description: Share PrairieLearn questions, assessments, or course instances with other courses or publicly, stop sharing them, or use questions another course shared. Use for requests such as "Share these questions with a colleague's course", "Make this homework public", or "Add CS 357's question to our quiz".
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
  removed and rotated. Make the safe choice your default: leave out questions
  on this term's exams and quizzes that are open or haven't run yet, or wait
  until after the term. Questions used only on past terms' assessments can be
  shared; say how many, since the course may reuse them, offer the list, and
  let the instructor decide. A general "go ahead" doesn't confirm publishing
  assessed content: ask about it by name until the instructor answers.
- **Ask before unsharing.** If another course uses a question shared by
  reference or in a set, PrairieLearn won't let you unshare it or remove it
  from the set, and the whole course fails to sync until the change is undone.
  You can't see other courses, so you can't tell whether one uses it. Before
  editing, say that, and give the options:
  - keep sharing it
  - ask the courses using it to copy it ("Make a copy" on its Settings page)
    or stop using it, then unshare
  - share a new copy from now on and keep the old one shared
  - try the change; if the sync reports the question is in use, undo it in a
    new review right away. The course keeps the approved change until that
    review is approved, even if your checkout or `git diff` already shows the
    old value, so always submit it

  Edit only after the instructor chooses. Turning off source sharing alone is
  always allowed.

## Do it

1. **Resolve the scope.** Name the exact questions, assessments, or course
   instance, by PrairieLearn title and directory. List candidates when the
   request is ambiguous. Then add what sharing needs: every question in a
   shared assessment, and every assessment and question in a shared course
   instance.
2. **Check each item** against the requirements and the judgment points above.
   You can't see whether sharing is enabled or whether the course has a sharing
   name. Content that is already shared shows both are in place. Otherwise
   include them in the owner step of your review rather than asking about them.
3. **Review once.** Before editing, send the instructor one short message in
   plain words, under about 100 words, shaped like this:

   ```markdown
   **I'd share <N> questions** with <who> through a sharing set: <two or three
   titles> and <N> more.

   **Left out:** <N> on <assessment>, which <has run / is open / hasn't run
   yet / may still be open>. <N> that can't be shared, because <a reason an
   instructor would recognize, such as "an older question format">.

   <N> of the shared questions were on past quizzes or exams; I can list them.

   **Before you say yes:** once <who> uses a question, it can't be renamed,
   deleted, or unshared. <The owner-only step, in a sentence.>
   ```

   End the message with the **Before you say yes** line; it already says why
   you're asking. Drop any line that doesn't apply. Mention the license only
   when sharing publicly. Leave out links, file names, how you found things,
   why you couldn't check something, and what these instructions require.
   Sharing works only between courses on the same PrairieLearn server; don't
   ask or warn about that unless the instructor mentions another server.
   Nothing changes before the yes, so don't say that either.

   When the request itself is to publish an exam or quiz, or most of what it
   asks for is assessed, name the questions that are on other assessments, and
   offer the safer ways to share: after the term ends, or with named
   instructors through a sharing set.

   If anything is irreversible or assessed, ask one short yes-or-no question,
   such as "Share these <N> questions?", without repeating the review in it,
   and wait for a yes; otherwise proceed. Don't ask for the other course's
   sharing token: only a course owner uses it, on the **Sharing** page. Name a
   new sharing set yourself after what it holds, such as
   `least-squares-coding`. The question shows as plain text, so keep the review
   out of it, and don't repeat the review afterwards.

4. **Apply.** Edit only the sharing fields, keeping each file's formatting,
   and submit the edits for review with one sentence, such as "Here's the
   sharing set for your review." The review shows the files, and your hand-off
   gives the owner step, so don't describe either here. PrairieLearn syncs the course when they are
   approved, and sync rejects the whole course if any sharing rule is broken.
   If the sync reports errors, look at which files they name:
   - sharing errors, or errors in files you changed: fix every one and submit
     again
   - errors only in other files: PrairieLearn reports the sync as failed
     whenever any file in the course has an error, but it still syncs every
     file that has none, so your sharing changes are in effect. Say that, name
     where the other errors are in a sentence, and stop; don't investigate or
     fix them unless asked
5. **Verify.** You can't open PrairieLearn pages, so give the instructor one
   page to check once the course has synced, the one that fits what you shared:
   - for a sharing set, the course's **Sharing** page
   - `/pl/public/course/<course_id>/questions`
   - `/pl/public/course_instance/<course_instance_id>/assessments`
   - for a reference, the question's preview in the consuming assessment

   The course's ID is in the path of the page the instructor is viewing.

## Use another course's question

Add it to the assessment as `@<sharing-name>/<qid>`. Its files aren't in this
checkout, so you can't read it, edit it, or check that its QID exists or is
shared with this course. Use the exact reference the instructor gives, from the
other course or its public questions page; if they give only a title, ask for
it rather than guessing a QID, even one that matches a pattern in the course.
A wrong reference fails the sync.

Before adding it, say in a sentence or two how it will be used:

- **By reference** (the default): the other course keeps maintaining it, this
  course gets its fixes, and nobody here can edit it.
- **By copy**: the instructor uses **Make a copy** on the question's Settings
  page to get an editable version that gets no later fixes.

## Hand off

After the change syncs, reply once, in two or three sentences:

- what is now shared, and the link or `@sharing-name/qid` references to send
- the owner-only step still needed, if any: choose a sharing name, add the
  other course to the set with its sharing token, or request the beta flag
- the page to check

Don't restate what can't be undone; the review said it.
