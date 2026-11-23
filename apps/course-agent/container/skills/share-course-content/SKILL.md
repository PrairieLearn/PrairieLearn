---
name: share-course-content
description: Share PrairieLearn questions, assessments, or course instances with other courses or publicly, stop sharing them, or use questions another course shared. Use for requests such as "Share these questions with a colleague's course", "Make this homework public", or "Add CS 357's question to our quiz".
---

# Share course content

Share exactly what the instructor means, with the mechanism that fits who should
get it. Don't publish exam content or take an irreversible step without saying
so first.

Before choosing a mechanism, read PrairieLearn's [content sharing
docs](https://docs.prairielearn.com/contentSharing/). They cover sharing sets,
public and source sharing, sharing assessments and course instances, sharing
names, sharing tokens, licenses, supported files, and what can't be undone. One
limit they don't state: sync rejects sharing settings on draft questions and on
questions in formats older than v3.

## Exercise judgment

- **Choose by audience.** Named colleagues get a sharing set. "Anyone can adopt
  it" gets source sharing, which can be undone. Share publicly by reference only
  when others need a live copy. Ask when the request doesn't say who.
- **Treat assessed content as sensitive.** Find every assessment, in any course
  instance, that uses each question. By default, leave out questions on this
  term's exams and quizzes that are open or haven't run yet. Questions used only
  on past terms' assessments can be shared, but the course may reuse them, so
  show them and let the instructor decide. A general "go ahead" doesn't confirm
  publishing assessed content. Source sharing also exposes answers, graders,
  and any secrets in the files, such as API keys; flag secrets so they can be
  removed and rotated.
- **Ask before unsharing.** The docs list what can't be undone once another
  course uses a question. A change that tries anyway makes the whole course fail
  to sync until it's undone, and you can't see other courses, so you can't tell
  whether one uses it. Before editing, give the options: keep sharing it, ask
  the other courses to [copy
  it](https://docs.prairielearn.com/contentSharing/#copying-a-shared-question)
  first, share a new copy from now on, or try the change and undo it in a new
  review if the sync reports the question is in use. The course keeps an
  approved change until a new review undoes it, even if your checkout already
  shows the old value. Turning off source sharing alone is always allowed.

## Do it

1. **Resolve the scope.** Name the exact questions, assessments, or course
   instance, by title. List candidates when the request is ambiguous. Add what
   sharing needs, such as every question in a shared assessment.
2. **Check each item** against the docs and the judgment above. You can't see
   whether sharing is enabled for the course or whether it has a sharing name;
   content that is already shared shows both are in place.
3. **Review once.** Before editing, send one message shaped like this:

   ```markdown
   **I'd share <N> of the <M> <what they are>** with <who> through a sharing set.

   | Question   | Used on                                          | Share |
   | ---------- | ------------------------------------------------ | ----- |
   | <title>    | <last assessment and term, or "—">               | Yes   |
   | ⚠️ <title> | <assessment and term>, <which may still be open> | No    |

   **Before you say yes:** <what can't be undone once they use it>. <The
   owner-only step, in a sentence.>
   ```

   - List every question in scope, shared ones first, when there are about 15
     or fewer. Past that, give one row per group instead: shared questions that
     were on past quizzes or exams, shared questions that never were, and one
     row per reason for leaving questions out. Put the count and two or three
     titles in the first cell, such as "16: Line Fit, Flights, and 14 more",
     and offer the full list.
   - Mark only the rows you'd leave out, with ⚠️. Their **Used on** cell gives
     the reason, such as "older question format".
   - The **Before you say yes** line is the message's last line. Don't close
     with a request to confirm, a summary, or what you'll do next; the
     question asks for the answer. Mention the license
     only when sharing publicly. Leave out links, file names, how you found
     things, and any mention of the docs or these instructions. Don't ask or warn about
     other PrairieLearn servers unless the instructor mentions one.
   - When the request is to publish an exam or quiz, offer the safer ways too:
     after the term ends, or with named instructors through a sharing set.

   If anything is irreversible or assessed, ask one short yes-or-no question,
   such as "Share these 16 questions?", in one sentence with no reasons, and
   wait for a yes; otherwise proceed.
   Don't ask for the other course's sharing token: only a course owner uses it.
   Name a new sharing set yourself after what it holds.

4. **Apply.** Edit only the sharing fields, keeping each file's formatting, and
   submit the edits for review with one sentence, such as "Here's the sharing
   set for your review." PrairieLearn syncs the course on approval. If the sync
   reports errors in files you changed, fix them and submit again. If they're
   only in other files, your changes still synced: say so in a sentence, name
   where the errors are, and stop.

## Use another course's question

Add it [by
reference](https://docs.prairielearn.com/contentSharing/#using-a-question-by-reference),
using the exact reference the instructor gives. Its files aren't in this
checkout, so you can't check it, and a wrong reference fails the sync. If they
give only a title, ask for the reference. Say in a sentence whether it will be
used by reference (the other course maintains it, and nobody here can edit it)
or [copied](https://docs.prairielearn.com/contentSharing/#copying-a-shared-question).

## Hand off

After the change syncs, reply once, in two or three sentences: what is now
shared, with the link or `@sharing-name/qid` references to send; the
owner-only step still needed, such as [adding the other
course](https://docs.prairielearn.com/contentSharing/#sharing-a-sharing-set-with-another-course)
on the **Sharing** page with its sharing token; and the page to check. Don't restate
what can't be undone.
