# Lesson 2: Creating assessments

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
	"allowAccess": [
		{
    	"role": "TA",
    	"endDate":  "2020-05-15T23:59:59"
		}	
	]
```

### Assessment `type`

There are two available options:

```json
"type": "Homework"
```
and 

```json
"type": "Exam"
```

#### Homework:

Every question added in the `infoAssessment.json` file will appear in the assessment. By default, the questions will appear in the same order they are entered in the `json` file. To shuffle the question, add the option:

```json
"shuffleQuestions": true
```

Students can create new instances of the question with different variables (when questions are randomized). The grading scheme rewards repeated correct answers for the same question.

#### Exam:

Option to randomly select questions that will appear in the Assessment, out of a list of questions in the `infoAssessment.json`. Order of questions is randomized. The title of the question is not displayed. For each exam instance, there is only one instance of the question and hence the variables are fixed. Students can retry questions for reduced points. To create "practice exams", where students can generate many instances of the same assessment, use:

```json
"multipleInstance": true
```


### Assessment `allowAccess`

There are many options to help customizing when and who should have access to your assessment. Take a look at the section [Access Control](https://prairielearn.readthedocs.io/en/latest/accessControl/) to learn more. 



##  Examples:

Before you start creating your assessments, make sure you have at least 4 questions inside your course. If you don't have that yet, copy some from the example course `XC 101` as we discussed in the previous lesson.

For all the following example assessments, we will use `"mode": "Public"`, since we will not be using the "in-person" CBTF facility in Fall 2020. Note that "Public" is the default configuration, so you actually don't need to explicitly enter this configuration in the json file. 

```json
"allowAccess": [
    {
        "mode": "Public"
    }
]
```


### Configuration 1:

* Use `"type":"Homework"`
* Questions appear in randomized order
* Homework submitted at the deadline receive 100% credit. Homework submitted up to 4 days late receive 70% credit. Homework submitted at least 2 days before the deadline get 5% bonus.
* Include two zones: one for easy questions, where each question has `"maxPoints": 5` and another one for more advanced questions, with `"maxPoints": 3`

### Configuration 2:

* Use `"type":"Exam"`
* Use `alternatives` to select questions out of a pre-defined set. For example:

```json
"questions": [{
	"numberChoose": 1,
    "points": [3,2,1],
    "alternatives": [
        {"id": "FirstAltQ"},
        {"id": "SecondAltQ"}
    ]
}]
```
* in `allowAccess`, set a time limit of 90 minutes. Make sure that you `startDate` and `endDate` allows for this time limit. 
* add a password

### Configuration 3:

* Start from `Configuration 2`
* Make it a practice exam
* Disable honor code message

### Configuration 4:

* Start from `Configuration 2`
* Make it a practice exam
* Disable honor code message








