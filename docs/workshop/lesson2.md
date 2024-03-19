# Lesson 2: Creating assessments

- [Lesson 2 Recording](https://mediaspace.illinois.edu/media/t/1_g3stfhgp/170964131)

## Quick overview

Let's take a look at some of the features available when customizing your assessments. You can find more information about assessment configuration [here](../assessment.md).

The beginning of the `infoAssessment.json` usually looks like this:

```json
{
  "uuid": "F11AD160-A99D-40AA-AC80-797A9E74ED43",
  "type": "Homework",
  "title": "Introduction",
  "set": "Homework",
  "number": "1",
  "allowAccess": []
}
```

### Assessment `type`

There are two available options:

```json
{
  "type": "Homework"
}
```

and

```json
{
  "type": "Exam"
}
```

#### Homework:

Every question added in the `infoAssessment.json` file will appear in the assessment. By default, the questions will appear in the same order they are entered in the `json` file. To shuffle the question, add the option:

```json
{
  "shuffleQuestions": true
}
```

Students can create new instances of the question with different variables (when questions are randomized). The grading scheme rewards repeated correct answers for the same question.

#### Exam:

Option to randomly select questions that will appear in the Assessment, out of a list of questions in the `infoAssessment.json`. Order of questions is randomized. The title of the question is not displayed. For each exam instance, there is only one instance of the question and hence the variables are fixed. Students can retry questions for reduced points. To create "practice exams", where students can generate many instances of the same assessment, use:

```json
{
  "multipleInstance": true
}
```

### Assessment `allowAccess`

There are many options to help customizing when and who should have access to your assessment. Take a look at the section [Access Control](https://prairielearn.readthedocs.io/en/latest/accessControl/) to learn more. Here I will briefly describe the option `mode`

There are two available options:

```json
{
  "mode": "Public"
}
```

and

```json
{
  "mode": "Exam"
}
```

**Exam** is used when students are taking an assessment via CBTF (in-person or the online service starting in the Fall 2020). **Public** is used for all other cases, where students have access to the assessment via the internet using any device.

## Examples:

Before you start creating your assessments, make sure you have at least 4 questions inside your course. If you don't have that yet, copy some from the example course `XC 101` as we discussed in the previous lesson.

### Configuration 1: "Traditional" homework

- Use `"mode": "Public"`
- Use `"type":"Homework"`
- Questions appear in randomized order
- Homework submitted at the deadline receive 100% credit. Homework submitted up to 4 days late receive 70% credit. Homework submitted at least 2 days before the deadline get 5% bonus.
- Include two zones: one for easy questions, where each question has `"maxPoints": 5` and another one for more advanced questions, with `"maxPoints": 3`

[Assessment template](https://us.prairielearn.com/pl/course_instance/4970/assessment/2316937) from the Example Course

### Configuration 2: Synchronous online exam without proctoring tool

- Use `"mode": "Public"` (not using CBTF)
- Use `"type":"Exam"`
- Use `alternatives` to select questions out of a pre-defined set. For example:

  ```json
  {
    "questions": [
      {
        "numberChoose": 1,
        "points": [3, 2, 1],
        "alternatives": [{ "id": "FirstAltQ" }, { "id": "SecondAltQ" }]
      }
    ]
  }
  ```

- Choose `startDate` and `endDate` to allow for a 1-hour window (this could be your lecture time). In `allowAccess`, set a time limit of 50 minutes. This gives extra 10-minutes for possible delays.
- Add a password

[Assessment template](https://us.prairielearn.com/pl/course_instance/4970/assessment/2316935) from the Example Course

### Configuration 3: Practice exams

- Start from `Configuration 2`
- Make it a practice exam
- Disable honor code message
- You may want to adjust the `startDate` and `endDate` to give students more opportunity for practice

[Assessment template](https://us.prairielearn.com/pl/course_instance/4970/assessment/1981282) from the Example Course

### Configuration 4: Synchronous exam using PrairieTest

When using [PrairieTest](https://us.prairietest.com/pt/docs/course/welcome) to schedule and deliver PrairieLearn exams, you need to using the following configuration:

- Start from `Configuration 2`
- Remove `startDate` and `endDate` from `allowAccess`. Instead use:

  ```json
  {
    "mode": "Exam",
    "examUuid": "5719ebfe-ad20-42b1-b0dc-c47f0f714871",
    "credit": 100
  }
  ```

You will be able to find the `examUuid` in PrairieTest.

## Homework 2

Continue creating questions using the elements highlighted in lesson 1.
You can also create one assessment. What options do you think will be useful for your course? You can take a look at different types of assessments in the [example course](https://us.prairielearn.com/pl/course_instance/4970/)
