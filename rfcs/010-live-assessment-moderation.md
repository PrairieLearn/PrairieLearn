# Summary

Establish a dashboard by which instructors can view students' progress on assessments in real-time.

# Motivation and background

During timed assessments such as exams or quizzes, instructors currently have to refresh the "Students" tab of the assessment page every time they want to see the latest grade statistics.

At the same time, while this does allow instructors to view students' grades while an exam is ongoing, there is no current way to see how far through an exam a student has progressed. Feedback is only available to instructors once the student has finished and submitted their exam for grading.

This RFC proposes a real-time dashboard for assessments allowing instructors to see students' progress as they answer questions on an exam. This will provide a singular, live point of access which eliminates the need to reload everything on the page.

As part of this, also proposed is a new metric called "Progress", similar to the "Score" metric, which would encapsulate the number of questions a student has hit the "save" button on in an exam. Additional data associated with this field would be available under the "Statistics" tab.

# Design

The real-time progress dashboard would be created by upgrading the existing "Students" tab on the instructor view of a particular assessment (`instructorAssessmentInstances`). From the current implementation, the following three changes would be made:

- A new column labeled `Progress` located between `Duration` and `Remaining`
- A new data header under the "Students" tab containing the percentage number of students that have engaged with the assessment, and the percentage average progress
- Adjustment such that the SQL database is re-polled every few seconds, the page automatically refreshing with the new data

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

Finally, the "Students" tab would be modified such that all or at least dynamic metrics, notably those relating to time and progress including the entire new data header, would refresh every few seconds. This allows the tab to be used as a one-stop-shop for progress information without having to constantly refresh the page. The following three options are possible:

- Full HTML-based webpage refresh every few seconds. This is the simplest to implement, but also resource-intensive as everything on the page would be regenerated.
- While loop in the JS source for loading data into the HTML elements. This would likely be faster but still intensive in terms of having to repeat the entire data-processing process.
- Websocket-based feed for the metrics. This is the most complex and also the fastest option, as only updated metrics need to be piped through the socket after an initial data load.

# Implementation plan

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