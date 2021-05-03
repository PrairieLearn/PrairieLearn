# Summary

Add features to the current gradebook interface as proposed in issue #3606.

# Table of Contents

1. [Motivation and Background](#motivation-and-background)
2. [Design](#design)
3. [Implementation Plan](#implementation-plan)

# Motivation and Background

Currently, a number of features which are common in other learning management systems, such as computing a student's final grade, can only be done in PrairieLearn by downloading the raw data. This RFC proposes an interface that adds a full gradebook, with functionality starting from what is proposed in issue #3606. This would allow instructors to save time by doing tasks which were previously only possible externally directly in the web interface.

# Design

The existing instructor gradebook and assessment pages would be extended to add spreadsheet-like functionality. From #3606, the following changes would be made:

- In each assessment, a new flag `scoreOnly` will determine if the assessment is only for score upload.
- Assessment-level `grade()` functions, as described in #3605.
- A course-level `grade()` function for computing a student's cumulative grade
- A python library of commonly-used grading functions

## Score Upload

Assessments marked for score upload cannot be attempted by students. Instead, as shown in #3606, assessment instances are created by instructors when uploading scores. The `scoreOnly` flag would be available in infoAssessment.json when creating or editing an assessment.

## Assessment-level grading functions

Each assessment can be given a `server.py` file which instructors can use to customize how assessments are graded. The current grading sproc will be split into two sprocs, one for fetching data and one for writing grades back into the database and logs.

## Course-level grading functions

A number of other features from #3606 could be combined into a course-level grading function:

- Curving the final grades, for example using MTM
- Using assessments as retries of other assessments
- Weighted assessment sets for computing the overall course score

A course-level `grade()` function would receive assessment score information and potentially aggregated statistics to facilitate curving. This data can be grouped into assessment sets, to allow for example dropping the lowest X assignments. 

# Implementation Plan

## Phase 1: Add Score Upload

- [ ] 1. Find how assessment flags are processed
- [ ] 2. Add a dummy `scoreOnly` flag for assessments
- [ ] 3. Add an interface for instructors to create assessment instances on behalf of students
- [ ] 4. Modify sprocs to allow the correct permissions for score-only assignments
- [ ] 5. Add testing and documentation for score upload

## Phase 2: Add Assessment-level Grading Functions

- [ ] 1. Modify assessment grading routine to retrieve additional data
- [ ] 2. Modify assessment grading routine to call grade function
- [ ] 3. Add interface to write `grade()` functions for assessments
- [ ] 4. Add testing and documentation for assessment-level grading

## Phase 3: Add Library of Grading Functions

- [ ] 1. Gather common grading functions
- [ ] 2. Design interfaces for grading functions
- [ ] 3. Implement library functionality and tests
- [ ] 4. Add documentation for library

## Phase 4: Add Course-level Grading Functions

- [ ] 1. Add interface to the course's instructor view to add `grade()` function
- [ ] 2. Add testing and documentation for course-level grading
