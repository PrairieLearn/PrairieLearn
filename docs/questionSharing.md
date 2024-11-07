**Question sharing is currently in beta.** If your course is hosted on the official PrairieLearn server, you may request that question sharing be turned on for your course. If you administer your own PrairieLearn server, you should _not_ use question sharing at this time. In the future, question sharing may be supported across PrairieLearn servers, so turning on question sharing on unofficial servers at this point in time may lead to naming conflicts in the future.

# Question sharing

In order to avoid instructors needing to copy question files in between courses, PrairieLearn provides a way for questions from one course to be used in assessments in other courses.

## Sharing names

In order for another course to use questions from your course into their assessments, you must have chosen a _sharing name_ for your course that they will use as a prefix to your question IDs when using them. This sharing name will be unique across all PrairieLearn instances and because it will be used in the JSON files for other courses, there will be no way to change the sharing name for your course once you have chosen it. It is recommended that you choose something short but descriptive. For example, if you're teaching a calculus course at a university that goes by the abbreviation "XYZ", then you could choose the sharing name "xyz-calculus". Then other courses will use questions from your course with the syntax `@xyz-calculus/qid`.

## Two ways to share: Publicly or through "Sharing sets"

Questions can either be shared publicly, so that anyone can preview the questions and use them in their course, or shared only to specific other courses using sharing sets.

Any question that is marked with `"sharePublicly": true` or `"shareSourcePublicly": true` will be considered and displayed as being published for free use under the [CC-BY-NC license](https://www.creativecommons.org/licenses/by-nc/4.0/).

## Sharing sets

Access to shared questions which are not shared publicly is controlled through **sharing sets**. A sharing set is a named set of questions which you can share to another course all at once. The sharing set system exists so that course owners may differentially share different sets of their questions. For example, an instructor may want to share some questions only with other courses in their department, and other questions with anyone using PrairieLearn. Sharing sets are created by adding them to the [`infoCourse.json` file](course.md#sharing-sets).

## Sharing a sharing set with another course

For security reasons, establishing the connection for one course to share questions with another course requires coordinated action by owners of the course sharing the questions (which we will refer to hereafter as the "sharing course") and the course that is using the questions that are being shared ('which we will refer to hereafter as the "consuming course")

In order to allow someone to share their questions with your course, you must provide them with the "Sharing Token" listed on the "Sharing" tab of your instructor settings page. Then the sharing course must use the sharing token which you provide to them to add your course as a consumer of one of their sharing sets.

## Using shared questions

To refer to a question from another course, use the question id (qid) prefixed by the `@` symbol and the sharing name of the other course. For example, to use the question `addNumbers` from the course with sharing name `test-course`, you would put `@test-course/addNumbers` into your `assessmentInfo.json`. In the context of the `assessmentInfo.json`, this may look like:

```json
"zones": [
    {
        "title": "Question Sharing Example",
        "comment": "These are new questions created for this exam",
        "questions": [
            {"id": "addNumbers", "autoPoints": [10, 5, 3, 1, 0.5, 0.25]},
            {"id": "@test-course/addNumbers", "autoPoints": [10, 9, 7, 5]}
        ]
    },
]
```

## Client and server files

Questions that make use of `clientFilesQuestion` and `serverFilesCourse` will work as expected. Using `clientFilesCourse` in a question is not supported at this time.

If a sharing course attempts to share a question which accesses client or server files associated with a course instance or an assessment, the question will not work as expected because the consuming course can not use it within the context of the sharing course's course instance or assessment.

See the [the client and server files documentation](clientServerFiles.md) for general information about client and server files.

Just as anyone with access to a question in your course can access any file in `clientFilesQuestion`, anyone with permissions to any of the questions you have shared from your course may also access these `clientFilesQuestion` files. This means that if you have any questions from your course that are publicly shared, anyone with access to the internet can access the `clientFilesQuestion` directories for these questions. Additionally, anyone with access to a question shared from your course will be able to access the client assets in your custom course elements, just as any students with access to your course can access the client assets in your custom course elements.

## Steps to share a question to a course, using a sharing set

**Note:** Once a question is added to a sharing set, the question cannot be renamed, deleted, or removed from the sharing set because doing so could break the assessments of people who have used the shared question.

1. On your course admin page, visit the "Sharing" tab.
2. Choose a sharing name for your course.
3. Create a sharing set by adding it to your course's `infoCourse.json` file.
4. Have the instructor or the course you would like to share your question with visit the "Sharing" tab on their course admin page and provide you with their course's sharing token.
5. Use the provided sharing token to add the other instructor's course as a consumer of the sharing set you created.
6. Add the sharing set to the `sharingSets` list in `info.json` file of the questions you would like to share.
7. The course you have shared the question with may now use it by referencing it in their assessments.

## Steps to share a question publicly

**Note:** Once a question is publicly shared, the question cannot be renamed, deleted, or un-publicly shared because doing so could break the assessments of people who have used the shared question. Sharing the source code of a question may be un-done.

1. On your course admin page, visit the "Sharing" tab.
2. Choose a sharing name for your course.
3. Add `"sharePublicly": true` to the `info.json` file of questions you would like to share publicly.
4. Optionally, add `"shareSourcePublicly": true` to the `info.json` file if you would like people to also be able to view and copy the source code of your question.
5. Anyone with a PrairieLearn account may preview your question, and any PrairieLearn course may now use it by referencing it in their assessments.
