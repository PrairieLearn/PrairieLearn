# Summary

Establish a dashboard by which instructors can view students' progress on assessments in real-time.

# Motivation and background

During timed assessments such as exams or quizzes, instructors currently have to refresh the "Students" tab of the assessment page every time they want to see the latest grade statistics.

At the same time, while this does allow instructors to view students' grades while an exam is ongoing, there is no current way to see how far through an exam a student has progressed. Feedback is only available to instructors once the student has finished and submitted their exam for grading.

This RFC proposes a real-time dashboard as a new tab on assessment pages, allowing instructors to see students' progress as they answer questions on an exam. This will provide a singular, live point of access which eliminates the need to reload everything on the page.

This dashboard would port over select metrics from the existing "Students" tab which would be useful to have live, as well as introduce new metrics for real-time per-question progress for students taking exams, data which currently isn't encapsulated in numerical form.


# Design

The real-time progress dashboard would be created by creating a new optional assessment overview tab, perhaps called `Progress`, which would contain relevant data to be updated in real-time. The following features are proposed:
- Overall structure similar to that of the `Students` tab, containing per-student identification data at minimum
- A column labeled `Completion` containing a summary metric of students' non-graded progress in an assessment
- A column labeled `Progress` containing a visual or numeric representation of per-question progress; see `Open Debates` at the end of this RFC
- A data header above the main table containing summary values for average progress, total number of students who've started an assessment, total number of students finished, and possibly average grade of specifically those who have finished depending on whether grades are included
- Automatic data refresh at a set interval

## Summary Completion Metric

`Completion` would be a new field associated with an assessment instance similar to the way `Score` is handled.

This field, when queried, would return the number of questions on an assessment where the save button has been clicked. This can be done by querying a count on the number of instance questions with one submission or more.

Similar to `Score`, `Completion` would also permit the computation of central tendency measures. Data such as average, standard deviation, median and maximum can be computed for `Completion` the way they are computed for `Score`, and perhaps displayed using similar charts under the "Statistics" tab of an assessment.

On the dashboard page, the metric would display using the same percent and bar formatting as the `Score` column on the `Students` tab, though potentially with a different color scheme to differentiate it from `Score` and the fact that this is not a metric corresponding to a graded valuation.

Ultimately, this field allows instructors to see a quick summary of the extent to which students have interacted with an assessment in one place. This will be useful for both observing student progress during exams, as well as for homework assignments which do not get graded until the entire assessment has been submitted.

## Data Header

The data header is meant to be a small addition to the dashboard to provide additional summary metrics. Currently, three pieces of data are proposed for this header:

- Raw number of students in a class that have started an assessment
- Raw or percentage (out of raw total who've started) number that have finished an assessment
- Percentage average completion in the assessment

These three metrics inform instructors both how much of a class is actually present, as well as show overall how well students are getting through an assessment. The metrics would update in real-time, like the rest of the dashboard, allowing a more in-depth look at student progress.

Average grade is not proposed for inclusion as in the main use case, exams, grades are not available until close to the end of the exam when students submit their work.

## Real-Time Engine

Next, the new dashboard would be set to have specific metrics refresh every few seconds. This allows the tab to be used as a one-stop-shop for progress information without having to constantly refresh the page. The following three options are possible:

- Full HTML-based webpage refresh every few seconds. This is the simplest to implement, but also resource-intensive as everything on the page would be regenerated.
- While loop in the JS source for loading data into the HTML elements. This would likely be faster but still intensive in terms of having to repeat the entire data-processing process.
- Websocket-based feed for the metrics. This is the most complex and also the fastest option, as only updated metrics need to be piped through the socket after an initial data load.

Option 1 is currently being trialled as part of [PR #3992](https://github.com/PrairieLearn/PrairieLearn/pull/3992/) on the existing `Students` tab and should inform implementation trajectories.

## Visual or Numeric Progress Data

In addition to the summary completion metric, it is possible to introduce more detailed metrics corresponding to per-question student interactions. These would introduce the ability for instructors to observe how students are navigating through exams, particularly question order and time spent per question. 

The majority of this should be possible by collecting timestamps when students click into or click out of a particular question, but it may also be useful to include question-save events as these indicate when a student has tentatively completed a question.

Using this metric, it is possible to create a student-by-student visualization, or a "timescale chart", of how one is interacting with an assessment.

These timescale charts are a timeline, bounded by the start and end of an assessment, along which events would be marked.

Question-save events could be marked as single markers, but events involving clicking into and out of a question can be represented as continuous bars from the click-in timestamp to the click-out timestamp. This allows the chart to show how long a student has attempted a question for and when. The timescale should also indicate any special parameters for multi-instance questions, if applicable.

Additionally, an overall summary chart contiaining perhaps a heatmap-style version of the chart (with different questions on different lines) averaged over all students could be placed at the top or bottom of this dashboard. The heatmap-like color scaling would indicate how many students are inside a particular question at a particular moment in time, with redder or greyer colors for zero and bluer colors for higher concentrations of students. At any moment, it is possible to compute how many students are on a specific question by reading the question number of the most recent click-in event for that student.

The idea is that by having this dashboard, anomalies such as questions immediately skipped or questions spent more time on than expected would then be trackable by professors and perhaps indicative of something wrong.

## Additional Options

A button to disable real-time updating would allow for a less visually dynamic dashboard and should be considered for cases when a simple static dashboard checked only from time to time would be more useful. This is also being tested in [PR #3992](https://github.com/PrairieLearn/PrairieLearn/pull/3992/).

## Open Debates

The following components of the RFC should be put under close evaluation:

- **Data to include in the dashboard.** Aside from progress metrics, it may be useful to include grades and time length data as well. However, as it has been indicated in the past that select metrics on the existing `Students` tab are computationally intensive, specifics of what to port should be discussed further based on needs.

- **Structure of timescales in the dashboard.** Having a separate timescale per student may be too computationally intensive to include and update in real-time. It may therefore be better to only include the single average summary chart containing data for question-interaction events instead. Additionally, if per-student timescales are included, consideration should be taken towards their appearance; a single timeline would fit better on the screen, whereas a stacked timeline with a different question represented on each line would be easier to read but take more space to display.

# Implementation plan

Phases 1 and 2 can be implemented in parallel.

## Phase 1: Implement Completion
- [ ]  1. Figure out how Score data is handled
- [ ]  2. Create a dummy entry for Completion in assessment instance structure
- [ ]  3. Modify the behaviour of Save in assessments to increment the Completion metric for an assessment instance
- [ ]  4. Add central tendency metrics for Completion to the Statistics tab
  
## Phase 2: Implement Real-Time Engine
- [ ]  5. Determine which of the three refresh methods to use
- [ ]  6. Test drive the method with just one metric, if applicable
- [ ]  7. Finish full implementation of the engine

## Phase 3: Implement Progress Dashboard
- [ ]  8. Create per-question progress metrics including timestamps
- [ ]  9. Create dummy layout for dashboard
- [ ] 10. Add data parser and displayer
- [ ] 11. Add summary timescale graph to tab

## Phase 2: Implement Data Header
- [ ] 12. Create a blank header space on the dashboard
- [ ] 13. Add student start/finish metrics
- [ ] 14. Add average Completion, potentially average grade
