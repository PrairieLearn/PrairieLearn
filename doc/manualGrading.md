# Manual Grading

PrairieLearn supports manual grading of questions by downloading a CSV file with student answers and uploading a CSV file with question scores and optional per-question feedback. There is not currently an online web interface for manual grading.


## Configuring a question for maual grading

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
  {{#feedback.manual}}
  <p>Feedback from course staff:</p>
  <markdown>{{{feedback.manual}}}</markdown>
  {{/feedback.manual}}
</pl-submission-panel>
```

This example template formats the feedback as Markdown.


## Downloading the students' submitted answers

After students have completed the assessment, download the submitted answers by going to the assessment page, then the "Downloads" tab, and selecting the `<assessment>_submissions_for_manual_grading.csv` file. This looks like:
```csv
uid,qid,old_score_perc,submission_id,params,true_answer,submitted_answer,score_perc,feedback
mwest@illinois.edu,explainMax,0,42983,{},{},{"ans": "returns the maximum value in the array"},,
zilles@illinois.edu,explainMax,0,42984,{},{},{"ans": "gives the set of largest values in the object"},,
zilles@illinois.edu,describeFibonacci,100,42987,{},{},{"ans": "calculates the n-th Fibonacci number"},,
```

This CSV file has two blank columns at the end, ready for the percentage score (0 to 100) and optional feedback. The `submission_id` is an internal identifier that PrairieLearn uses to determine exactly which submitted answer is being graded. The `params` and `true_answer` columns show the question data. The `old_score_perc` column shows the score that the student currently has, which is convenient for re-grading or doing optional manual grading after an autograder has already done a first pass.

If the students uploaded files then you should also download `<assessment>_files_for_manual_grading.zip` from the "Downloads" tab. The scores and feedback should still be entered into the CSV file.


## Uploading the scores and feedback

After editing the percentage score and/or feedback for each submitted answer, upload the CSV file by going to the assessment page, then the "Uploads" tab, and selecting "Upload new question scores". If you leave either `score_perc` or `feedback` (or both) blank for any student, then the corresponding entry will not be updated.

Each question will have its score and/or feedback updated and the total assessment score will be recalculated. All updates are done with `credit` of 100%, so students get exactly the scores as uploaded.

If you prefer to use points rather than a percentage score, rename the `score_perc` column in the CSV file to `points`.
