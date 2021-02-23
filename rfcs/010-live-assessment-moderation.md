# Summary

Establish a dashboard by which instructors can view students' progress on assessments in real-time.

# Motivation and background

During timed assessments such as exams or quizzes, instructors currently have to refresh the "Students" tab of the assessment page every time they want to see the latest grade statistics.

At the same time, while this does allow instructors to view students' grades while an exam is ongoing, there is no current way to see how far through an exam a student has progressed. Feedback is only available to instructors once the student has finished and submitted their exam for grading.

This RFC proposes a real-time dashboard for assessments allowing instructors to see students' progress as they answer questions on an exam. This will provide a singular, live point of access which eliminates the need to reload everything on the page.

As part of this, also proposed is a new metric called "Progress", similar to the "Score" metric, which would encapsulate the number of questions a student has hit the "save" button on in an exam. Additional data associated with this field would be available under the "Statistics" tab.

Proposed as well is a potential auxiliary dashboard separate from the students page displaying per-question progress data. This would indicate specifically where in an exam students are, as well as what order students are attempting questions in and if any questions have not yet been attempted.

# Design

The real-time progress dashboard would be created by upgrading the existing "Students" tab on the instructor view of a particular assessment (`instructorAssessmentInstances`). From the current implementation, the following three to four changes would be made:

- A new column labeled `Progress` located between `Duration` and `Remaining`
- A new data header under the "Students" tab containing the percentage number of students that have engaged with the assessment, and the percentage average progress
- Adjustment such that the SQL database is re-polled every few seconds, the page automatically refreshing with the new data
- Potential auxiliary dashboard in a new tab with a name TBD containing per-question progress data (potentially also named `Progress`)

## Progress Metric

`Progress` would be a new field associated with an assessment instance similar to the way `Score` is handled.

This field, when queried, would return the number of questions on an assessment where the save button has been clicked. Internally, this can be accumulated one of two ways:

- Incrementing the field every time a question is marked as "saved" for the first time. This would make the field capture the number of validly complete questions
- Incrementing the field every time a question is unmarked from "unanswered" for the first time. This would make the field capture the number of questions a student has attempted overall instead of just those which are wholly complete

Unlike `Score`, `Progress` is a continuously increasing metric independent of any attempts framework. That is, once progress has incremented, it is not possible to achieve lower progress in any further attempt. This means subfields for maximum and minimum progress will not be necessary; rather, a single field which increases as a student moves through an assessment will be sufficient.

Similar to `Score`, `Progress` would also permit the computation of central tendency measures. Data such as average, standard deviation, median and maximum can be computed for `Progress` the way they are computed for `Score`, and displayed using similar charts under the "Statistics" tab of an assessment. For convenience, average progress could be provided as a header metric at the top of the revised "Students" dashboard page which could also update in real-time.

On the dashboard page, the metric would be located between the `Duration` and `Remaining` columns in a column labeled `Progress`. The metric would display using the same percent and bar formatting as the `Score` column, though potentially with a different color scheme to differentiate it from `Score` and the fact that this is not a metric corresponding to a graded valuation.

Ultimately, this field allows instructors to see the extent to which students have interacted with an assessment in one place. This will be useful for both observing student progress during exams, as well as for homework assignments which do not get graded until the entire assessment has been submitted.

## Students Tab Data Header

The data header is meant to be a small addition to the "Students" tab for readability and to avoid having to switch between tabs to access data regarding an ongoing exam. Currently, only two pieces of data are proposed for this header:

- Percentage number of students in a class that have started an assessment
- Percentage average progress in the assessment

These two metrics inform instructors both how much of a class is actually present, as well as show overall how well students are getting through an assessment. The metrics would update in real-time, like the rest of the revised dashboard, allowing a more in-depth look at student progress.

Average grade is not proposed for inclusion as in the main use case, exams, grades are not available until close to the end of the exam when students submit their work.

## Real-Time Engine

Next, the "Students" tab would be modified such that all or at least dynamic metrics, notably those relating to time and progress including the entire new data header, would refresh every few seconds. This allows the tab to be used as a one-stop-shop for progress information without having to constantly refresh the page. The following three options are possible:

- Full HTML-based webpage refresh every few seconds. This is the simplest to implement, but also resource-intensive as everything on the page would be regenerated.
- While loop in the JS source for loading data into the HTML elements. This would likely be faster but still intensive in terms of having to repeat the entire data-processing process.
- Websocket-based feed for the metrics. This is the most complex and also the fastest option, as only updated metrics need to be piped through the socket after an initial data load.

## Potential Per-Question Progress Dashboard

Depending on how it would turn out, it may also be possible to create a secondary dashboard containing specialized per-question progress metrics. These metrics would be separate from the overall progress metric and might be capable of containing the following data, inheriting from existing assessment events or potentially just being a display of those events directly:

- Timestamp when students click into or click out of a particular question
- Timestamp when students have clicked save on a question (though this may be redundant)
- Other metrics TBD based on further required analysis and demand

This would allow a new dashboard containing row-by-row overviews relating to each question in an assessment. The setup would be similar to that of the students page, but the physical size of the proposed charts prohibit inclusion of the metric on the students page without it becoming visibly larger.

Each row would correspond to a single student, and there would only be columns for student info and the timescale charts.

These timescale charts are a timeline, bounded by the start and end of an assessment, along which events would be marked. On the y-axis of the chart would be the list of question numbers, in increasing order bottom to top or top to bottom.

Question-save events could be marked as single markers, but events involving clicking into and out of a question can be represented as continuous bars from the click-in timestamp to the click-out timestamp. This allows the chart to show how long a student has attempted a question for and when.

Two alternatives are possible. One option is to have this stacked per-question display where events for a particular question are in different rows of the chart. This would make it easier to visualize question-specific events.

Alternatively, since time is linear, a singular row containing all the events and separate labels for question-specific events would fit in a smaller space, but at the same time it would be more difficult to view question-specific progress. The first option is recommended.

Finally, an overall summary chart contiaining perhaps a heatmap-style version of the option 1 chart averaged over all students could be placed at the top of this dashboard. The heatmap-like color scaling would indicate how many students are inside a particular question at a particular moment in time, with redder or greyer colors for zero and bluer colors for higher concentrations of students. At any moment, it is possible to compute how many students are on a specific question by reading the question number of the most recent click-in event for that student.

The idea is that by having this dashboard, anomalies such as questions immediately skipped or questions spent more time on than expected would then be trackable by professors and perhaps indicative of something wrong.

## Additional Options

A toggle switch for the real-time dashboards disabling real-time feeds could be included. This would be easier to look at and process when outside of an exam scenario.

The original Progress metric may not need to be stored as a physical variable if the current setup is capable of reading off question-save events from a student's event history in a fast-enough time. If not, these events should be stored in a variable for faster access. Instead of progress being a numerical value, its possible for progress to contain references to the original events, which provides access to timestamp data, but this is not required.

# Implementation plan

Phases can be implemented largely in parallel, except step 9 and Phase 4 which require Phase 1 to be complete.

## Phase 1: Implement Progress
- [ ]  1. Figure out how Score data is handled
- [ ]  2. Create a dummy entry for Progress in assessment instance structure
- [ ]  3. Determine which of the two measures of Progress to use
- [ ]  4. Modify the behaviour of Save in assessments to increment the Progress metric for an assessment instance
- [ ]  5. Add a column to the Students tab containing Progress as a percent bar
- [ ]  6. Add central tendency metrics for Progress to the Statistics tab
  
## Phase 2: Implement Data Header
- [ ]  7. Create a blank header space above the columns in the Students tab
- [ ]  8. Add percentage number of student instances to header
- [ ]  9. Add average Progress to header

## Phase 3: Implement Real-Time Engine
- [ ] 10. Determine which of the three refresh methods to use
- [ ] 11. Test drive the method with just one metric, if applicable
- [ ] 12. Finish full implementation of the engine

## Phase 4: Potentially Implement Progress Dashboard
- [ ] 13. Create per-question progress metrics including timestamps
- [ ] 14. Create dummy layout for tab
- [ ] 15. Add data parser and displayer
- [ ] 16. Add summary timescale graph to tab