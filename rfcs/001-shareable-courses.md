# Summary

A mechanism for allowing course content to be shared with other courses.

# Basic Example

A course can be designated as shareable by setting the `shareable` flag in its `infoCourse.json` file:

```json
{
  "uuid": "754dac56-fc1f-4888-a74a-1b365fd48376",
  "shareable": true
}
```

Shareable courses will have a globally unique, human readable ID, like `uiuc-data-structures`.

Questions in a shareable course are defined the same way that they are for normal courses. That is, a directory in a `questions` directory. For example, the file `questions/avl-tree/info.json` defines a question with the ID `avl-tree`.

Questions from a shareable course can be referenced from a different course with a combination of course ID and question ID. For instance, in the following simplified `infoAssessment.json`, `@uiuc-data-structures/avl-tree` references the `avl-tree` question from the `uiuc-data-structures` shareable course.

```json
{
  "uuid": "754dac56-fc1f-4888-a74a-1b365fd48379",
  "zones": [
    {
      "title": "Questions",
      "bestQuestions": 3,
      "questions": [
        { "id": "localQuestion", "points": 1, "maxPoints": 5 },
        { "id": "uiuc-data-structures/avl-tree", "points": 1, "maxPoints": 5 }
      ]
    }
  ]
}
```

# Motivation

As PrairieLearn becomes more widely used, courses want to be able to easily share questions. Currently this is accomplished by copying question files between courses. However, this approach requires a lot of manual effort to copy questions around and keep them up-to-date as questions are improved. By adding first-class support for sharing questions, we hope to reduce the burden of sharing questions.

# Detailed design

Shareable courses will be modeled identically to normal courses: as GitHub repositories containing questions.

## Usage across multiple PrairieLearn instances.

By design, PrairieLearn is a decentralized system. There are now several production instances running at different universities, and dozens (if not hundreds) of individuals run PrairieLearn on their computers for local course development. The architecture of shareable courses needs to take this decentralized nature into account.

Making a shareable course available to an institution's instance of PrairieLearn will be as simple as syncing it like a normal course. Updates to shareable courses are also handled via syncing.

For the first iteration of shareable courses, syncing to acquire updates will be a manual process. In the future, a syncing protocol could be designed so that shareable courses are automatically updated across all production PrairieLearn instances where they're in use.

For local development, there are two scenarios:

- The person running PrairieLearn locally does not have the necessary permissions to clone the shareable course repository, or they do but have not previously cloned it. In that case, an attempt to access an external question from a shareable course will provide a clear error page explaining why the question cannot be viewed there and offering instructions on how to clone and add the course.
- The person running PrairieLearn locally has cloned the shareable course repository. In this case, they can add the course to their local Docker container. Then, questions from that shareable course can be accessed exactly like they would be in a production environment.

In the future, one could build a feature that allows an authorized user to export a copy of a shareable course for use with local development.

## Safety guarantees

The following guarantees should exist:

- There is no ambiguity between whether a question belongs to a course or an external shareable course.
- Syncing a new version of a shareable course should not break any existing assessments that reference questions from it.
- There should never be an assessment on a production instance that references a question that does not exist.

The following facts and behaviors ensure those guarantees:

- A leading `@` in a question ID in an assessment definition will unambiguously differentiate shareable course questions from course-local questions.

- Once a course has been designated as shareable, it must remain shareable. That is, once a course with `"shareable": true` is synced to an instance of PrairieLearn, attempting to sync the same course with `"shareable": false` will be a sync error.

- Once a question in a shareable course has been synced to an instance of PrairieLearn, attempting to perform a sync where the question would be renamed or deleted will be a sync error. _(Is there any special consideration necessary for local development?)_

- To allow question renaming, we could add a concept of _question aliases_, which are alternative QIDs specified in the `info.json` file. In this case it would be allowed to rename a question, so long as the old name was simultaneously added as an alias. The in-browser editor could automate this by adding an alias for the old name whenever renaming a question.

- When a course is synced, all questions that are referenced by its assessments will be checked. If a referenced shareable course is not available on that instance, or a question within a referenced shareable course does not exist, the sync will error. _(Note that this restriction is relaxed in local installations of PrairieLearn, where a user may not have the necessary permissions to clone the shareable course repository.)_

## Access control

Even though shareable courses are "courses", they will not be visible in PrairieLearn for students to register for.

On a given PrairieLearn instance, the ability to sync a shareable course is controlled the same way that it is for courses: via the "course access roles" configuration.

# Drawbacks

## Inability to configure or augment questions

With this proposed solution, there isn't an obvious way to control the behavior of a given question, such as adjusting the difficulty level or adjusting units/tolerances based on the needs of a particular course. There's also no way to augment questions, such as by providing additional instructions for a given question.

It's unclear if either of these features would be needed in practice. However, it's worth calling them out to be aware of the limitations. These constraints might actually prove useful by encouraging sensible defaults and ensuring that questions are self-contained so that additional instructions/context aren't needed.

# Alternatives

## No formal support for sharing questions

This is the current state of PrairieLearn. "Sharing" a question involves manually copying all of its files from one course to another. From a technical perspective, this solution is simple, as it requires no special treatment in PrairieLearn code. However, it scales poorly as it requires a lot of manual action to propagage question enhancements or fixes.

## Share questions directly from courses

Instead of having a special flag to indicate a shareable course, one could share questions directly from any existing course. From a technical perspective this is slightly easier than the proposal of dedicated shareable courses.

The first drawback to this solution is that it makes it hard to ensure the previously-mentioned consistency guarantees. Since a normal course is a self-contained unit, questions can be renamed and deleted at will as long as all references to the question within the course change at the same time. This is by design, as it allows courses to reorganize their course material as time goes on. However, with dedicated shareable courses, a question's ID becomes a part of the "interface" of the course.

The second drawback is less technical and more organizational. Specifically, it does nothing to discourage tying a question too closely to the needs of a particular course/institution or making changes that may be unexpected or undesired by consumers of the question. While we can't enforce these things at the technical level, the hope is that by having shared questions located in a separate repo, question editors will think more carefully about how they design questions and the changes they make to them over time.

# Potential future enhancements

The following features are not necessary for an MVP version of this feature, but are called out for the sake of discussion.

## Question deprecation

To ensure safety guarantees, once a question in a shareable course exists, it cannot be renamed or deleted. However, as shareable courses eveolve over the course of many years, certain questions may become outdated or broken and there may not be sufficient resources to update them. To make it easy for this to be communicated to consumers of questions, a "deprecated" flag could be added to a question's `info.json` file:

```json
{
  "uuid": "754dac56-fc1f-4888-a74a-1b365fd48376",
  "deprecated": true
}
```

Deprecated questions could render a warning in instructor views of the question, on a question's row in an assessment overview, or in other useful locations across PrairieLearn.

# Unresolved questions and concerns

## Shareable course IDs

Shareable course IDs are how questions from shareable courses are referenced in assessments. Ideally, these IDs should have the following properties:

- Static (do not change over time)
- Consistent across instances of PrairieLearn
- Human-readable

Because they must be human readable, a shareable course's UUID is unsuitable as the user-facing course ID. The `name` value in `infoCourse.json` could be repurposed for this, but it should have additional restrictions (no spaces) and has a different semantic meaning. A new `id` value could be introduced that has no meaning in standard courses.

## Access control within a PrairieLearn instance

As with normal courses, access to shareable courses should be carefully controlled. It should also be consistent: if I'm staff for a course instance, I should be able to access shareable courses that are referenced by my courses' assignments. It's not clear how this access should be requested, granted, or managed.

These permissions should likely not live in a shareable courses's repo - they're likely going to be specific to the instance of PrairieLearn a course is running on.

Perhaps permissions should exist at the course level - a PrairieLearn admin can grant course X the ability to use and view shareable course Y. That permission would be transitive: if I'm course staff for course X, and course X has the ability to use shareable course Y, then I should be able to view and use anything in shareable course Y.

## Discovery

At first, the existence of shareable courses will probably be shared directly between staff from courses. However, this word-of-mouth does not scale well. There should be a way to see what shareable courses exist, both globally and on a particular instance of PrairieLearn.
