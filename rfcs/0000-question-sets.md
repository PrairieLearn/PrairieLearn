# Summary

A mechanism for allowing sets of questions to be published and used by multiple courses.

# Basic Example

A course can be designated as a question set by setting the `questionSet` flag in its `infoCourse.json` file:

```json
{
  "uuid": "754dac56-fc1f-4888-a74a-1b365fd48376",
  "questionSet": true
}
```

Question sets will have a unique, human readable name, like `uiuc-data-structures`.

Questions in a question set are defined the same way that they are for courses. That is, a directory in a `questions` directory. For example, the file `questions/avl-tree/info.json` defines a question with the ID `avl-tree`.

Questions from a question set can be referenced with a combination of question set ID and question ID. For instance, in the following simplified `infoAssessment.json`, `uiuc-data-structures/avl-tree` references the `avl-tree` question from the `uiuc-data-structures` question set.

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

*TODO*

# Detailed design

Question sets will be modeled similarly to courses: as GitHub repositories containing questions.

## Usage across multiple PrairieLearn instances.

By design, PrairieLearn is a decentrilized system. There are now several production instances running at different universities, and dozens (if not hundreds) of individuals run PrairieLearn on their computers for local course development. The architecture of question sets needs to take this decentralized nature into account.

Making a question set available to an institution's instance of PrairieLearn will be as simple as syncing it like a normal course. Updates to question sets are also handled via syncing.

For the first iteration of question sets, syncing to acquire updates will be a manual process. In the future, a syncing protocol could be designed so that question sets are automatically updated across all production PrairieLearn instances where they're in use.

For local development, there are two scenarios:

* The person running PrairieLearn locally does not have the necessary permissions to clone the question set repository. In that case, an attempt to access an external question from a question set will provide a clear error page explaining why the question cannot be viewed there.
* The person running PrairieLearn locally is able to clone the question set repository. In this case, they can add the course to their local Docker container. Then, questions from question sets can be accessed exactly like they would be in a production environment.

In the future, one could build a feature that allows an authorized user to export a copy of a question set for use with local development.

## Safety guarantees

The following guarantees should exist:

* There is no ambiguity between whether a question belongs to a course or a question set.
* Syncing a new version question set should not break any existing assessments that reference questions from it.
* There should never be an assessment on a production instance that references a question that does not exist.

The following facts and behaviors ensure those guarantees:

* The presence of a `/` in a question ID in an assessment definition will unambiguously differentiate question set questions from course-local questions. Since question IDs are derived from the name of a directory in a `questions` directory and `/` is not a valid character in a directory name, questions are implicitly prohibited from containing.

* Once a course has been designated as a question set, it must remain a question set. That is, once a course with `"questionSet": true` is synced to an instance of PrairieLearn, attempting to sync the same course with `"questionSet": false` will be a sync error.

* Once a question in a question set has been synced to an instance of PrairieLearn, attempting to perform a sync where the question would be renamed or deleted will be a sync error.

* When a course is synced, all questions that are referenced by its assessments will be checked. If a referenced question set is not available on that instance, or a question does not exist, the sync will error. *(Note that this restriction is relaxed in local installations of PrairieLearn, where a user may not have the necessary permissions to clone the question set.)*

## Access control

Even though question sets are "courses", they will not be visible in PrairieLearn for students to register for.

On a given PrairieLearn instance, the ability to sync a question set is controlled the same way that it is for courses: via the "course access roles" configuration.

# Drawbacks

*TODO*

# Alternatives

*TODO*

# Unresolved questions and concerns

## Question set IDs

Question set IDs are how question sets are referenced in assessments. Ideally, question set IDs should have the following properties:

* Static (do not change over time)
* Consistent across instances of PrairieLearn
* Human-readable

Because they must be human readable, a question set's UUID is unsuitable as the user-facing question set ID. The `name` value in `infoCourse.json` could be repurposed for this, but it should have additional restrictions (no spaces) and has a different semantic meaning. A new `id` value could be introduced that has no meaning in standard courses.

## Access control within a PrairieLearn instance

As with normal courses, access to question sets should be carefully controlled. It should also be consistent: if I'm staff for a course instance, I should be able to access question sets that are referenced by my courses' assignments. It's not clear how this access should be requested, granted, or managed.

These permissions should likely not live in a question set's repo - they're liekly going to be specific to the instance of PrairieLearn a course is running on.

Perhaps permissions should exist at the course level - a PrairieLearn admin can grant course X the ability to use and view question set Y. That permission would be transitive: if I'm course staff for course X, and course X has the ability to use question set Y, then I should be able to view and use anything in question set Y.

## Discovery

At first, the existencen of question sets will probably be shared directly between staff from courses. However, this word-of-mouth does not scale well. There should be a way to see what question sets exist, both globally and on a particular instance of PrairieLearn.
