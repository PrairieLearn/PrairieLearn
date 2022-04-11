# InstructorAssessmentProgress

## Summary: 

This is an incomplete project to add a tab to the instructor console on PrairieLearn that would provide a visual breakdown of student progress through live assessments as they unfold. The idea is that because grades are not available until after a student has submitted any live assessment, a progress visualization would allow instructors to see the following metrics:

- how far students have gotten through each assessment (in terms of which questions were clicked on and/or saved)
- how long students have spent on each question (in terms of time between first interaction and most recent interaction with the question)
- which questions are being skipped by students

These metrics would allow instructors to see in real-time how well students are interacting with assessments. It would allow easier and faster detection of problems should there turn out to be a typo or error on an assessment impacting students' ability to solve a particular question. It would also provide a metric by which instructors could determine which questions were faster or more tedious to work through and compare this to student performance through grades on the same questions after the assessment is complete.

The initial brainstorm can be found here: https://github.com/jbrightuniverse/PrairieLearn/blob/master/rfcs/010-live-assessment-moderation.md

## Work so far:

The included files generate an additional page for the PL instructor console. This page currently renders a populated demo progress chart when an assessment is triggered by any student. The chart currently pulls the assessment start date from the student's log and displays it; this serves as a demo for how other components of the log may be used to generate the progress visualization. An example:
![image](https://user-images.githubusercontent.com/30967260/162807399-68b725b9-8044-4213-af16-40b625e33ab2.png)

Also adjusted are:
- Tab for the instructor console: https://github.com/jbrightuniverse/PrairieLearn/blob/master/pages/partials/navTabs/instructorAssessment.ejs
- Page route: https://github.com/jbrightuniverse/PrairieLearn/blob/master/server.js
- SQL query to retrieve log: https://github.com/jbrightuniverse/PrairieLearn/blob/master/sprocs/assessment_progress_select_log.sql

## Work that needs to be done: 

The goal of the project is to be able to visualize student progress through charts. The next step is to use elements of the student logs such as question clicks and question saves to create barplots which represent the interval of time between these clicks and then render them in rows which represent each question. This was just one proposed representation; other representations could be used instead.

One proposal was to have the chart display on the `students` tab as a hidden column; this is likely a more efficient approach and should be considered if the project is completed.

In addition, the project could benefit from data in the aggregate; that is, a single average chart or heatmap chart representing the average progress that a particular class has made on an assessment. Seeing each student's progress at the same time would allow better intuition as to which questions are working well and which may have issues.

After progress data is fed into the charts, the system needs to be tested at-scale to ensure it does not take significant time to render. Part of speeding this up may include altering the SQL query or only rendering some tables at a time. 

## Warnings:

This code was generated before the port of the table renderer to the current, more updated system, and as such the code would need some reworking to achieve parity with this update.
