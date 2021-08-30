# Manual Grading

PrairieLearn supports manual grading of questions by downloading a CSV file with student answers and uploading a CSV file with question scores and optional per-question feedback. There is not currently an online web interface for manual grading.


## Configuring a question for manual grading

The [`info.json` file](question.md#question-infojson) in the question should set `"gradingMethod": "Manual"`, like this:
```json
{
    "uuid": "cbf5cbf2-6458-4f13-a418-aa4d2b1093ff",
    "gradingMethod": "Manual",
    "singleVariant": true,
    ...
}
```

Manually-graded questions allow students to "Save" answers, but they don't have a "Save & Grade" button. Instead, the student just saves answers as many times as they want, and all of their submitted answers are stored. It is recommended to also mark manually-graded questions as `"singleVariant": true` so that students are only given a single random variant, even on Homework assessments.

Any [elements](elements/) can be used in the [`question.html`](question.md#question-questionhtml) to write manually graded questions. All of the student input will be saved and available for manual grading, including `pl-string-input`, `pl-file-editor`, `pl-file-upload`, etc.

To show manual feedback the `question.html` file should contain an element to display the feedback next to student submissions. A basic template for this is:
```html
<pl-submission-panel>
  <pl-feedback></pl-feedback>
</pl-submission-panel>
```
This example template formats the feedback as Markdown by default. For more details, check the documentation for [`pl-feedback`](elements.md#pl-feedback-element).


## Downloading the students' submitted answers

After students have completed the assessment, download the submitted answers by going to the assessment page, then the "Downloads" tab, and selecting the `<assessment>_submissions_for_manual_grading.csv` file. This looks like:
```csv
uid,uin,username,name,role,qid,old_score_perc,old_feedback,submission_id,params,true_answer,submitted_answer,old_partial_scores,partial_scores,score_perc,feedback
mwest@illinois.edu,1,,,,explainMax,0,,42983,{},{},{"ans": "returns the maximum value in the array"},,,,
zilles@illinois.edu,2,,,,explainMax,0,,42984,{},{},{"ans": "gives the set of largest values in the object"},,,,
zilles@illinois.edu,2,,,,describeFibonacci,100,,42987,{},{},{"ans": "calculates the n-th Fibonacci number"},,,,
```

This CSV file has three blank columns at the end, ready for the percentage score (0 to 100) and optional feedback and partial scores. The `submission_id` is an internal identifier that PrairieLearn uses to determine exactly which submitted answer is being graded. The `params` and `true_answer` columns show the question data. The `old_score_perc` column shows the score that the student currently has, which is convenient for re-grading or doing optional manual grading after an autograder has already done a first pass. If feedback was already provided in a previous upload, the `old_feedback` column will contain the feedback the student currently has.

If the students uploaded files then you should also download `<assessment>_files_for_manual_grading.zip` from the "Downloads" tab. The scores and feedback should still be entered into the CSV file.

### Workspaces

To include files copied out of the workspace into the `<assessment>_files_for_manual_grading.zip`, in the [`info.json` file](workspaces/index.md#infojson) specify a file list using `"gradedFiles"`
```json
"workspaceOptions": {
        "gradedFiles": [
            "starter_code.h",
            "starter_code.c"
        ],
        ...
}
...
```

## Uploading the scores and feedback

After editing the percentage score and/or feedback for each submitted answer, upload the CSV file by going to the assessment page, then the "Uploads" tab, and selecting "Upload new question scores". If you leave either `score_perc` or `feedback` (or both) blank for any student, then the corresponding entry will not be updated.

Each question will have its score and/or feedback updated and the total assessment score will be recalculated. All updates are done with `credit` of 100%, so students get exactly the scores as uploaded.

If you prefer to use points rather than a percentage score, rename the `score_perc` column in the CSV file to `points`.

You also have the option to set partial scores. These can be based on individual elements of the question (typically based on the `answers-name` attribute of the element), or any other setting you wish to use. Partial scores must be represented using a JSON object, with keys corresponding to individual elements. Each element key should be mapped to an object, and should ideally contain values for `score` (with a value between 0 and 1) and `weight` (which defaults to 1 if not present). For example, to assign grades to a question with elements `answer1` and `answer2`, use:

```json
{"answer1": {"score": 0.7, "weight": 2, "feedback": "Almost there!"}, "answer2": {"score": 1, "weight": 1, "feedback": "Great job!"}}
```

If the `partial_scores` column contains a valid value, and there is no value in `score_perc` or `points`, the score will be computed based on the weighted average of the partial scores. For example, the score above will be computed as 80% (the weighted average between 70% with weight 2, and 100% with weight 1).

*WARNING*: note that some elements such as drawings or matrix elements may rely on elaborate partial score values with specific structures and objects. When updating partial scores, make sure you follow the same structure as the original partial scores to avoid any problems. Changing these values could lead to errors on rendering the question pages for these elements.
