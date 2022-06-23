# Summary
A page at the course-instance level for group statistics. 

# Basic Example Workflow
An instructor with appropriate access uploads a reference (i.e. desired) groups assignment for their class. PrairieLearn will display group-level statistics across assessments in a given course instance. Instructor can then decide to adjust filters and parameters to get desired statistics and be able to recompute and download. 

*Group Participation* 

Filters: [Exclude Assignment 2]

| GroupName | Student IDs | Assessment 1 | ... | Assessment N|
|-----------|-------------|--------------|-----|-------------|
| GroupA    | Student 1   |      Y       | ... |      Y      |
|           | Student 2   |      X       | ... |      Y      |
|           | Student 3   |      Y       | ... |      Y      |
|           | Student 4   |      Y       | ... |      Y      |

(In this example, Student 2 did not work with their assigned group on assessment 1.)

*Role Participation*

Filters: [Include student data from any group]

| Student ID | Role 1 | Role 2 | Role 3 | Role 4 |
|------------|--------|--------|--------|--------|
| Student 1  |    3   |   1    |   1    |   1    |
| Student 2  |    1   |   1    |   1    |   1    |
| Student 3  |    2   |   1    |   2    |   1    |
| Student 4  |    0   |   2    |   1    |   2    |

*Submission Count* 

Filters: [Include student data from assigned group only]

| Student ID | Assessment 1 | ... | Assessment N | Total | Percentage of Group |
|------------|--------------|-----|--------------|-------|---------------------|
| Student 1  |      5       | ... |      0       |  30   |        34.88        |
| Student 2  |      1       | ... |      2       |   8   |         9.30        |
| Student 3  |      8       | ... |     12       |  28   |        32.55        |
| Student 4  |      2       | ... |      7       |  20   |        23.26        |


# Motivation
As group assessments are now a familiar feature of PrairieLearn, is important that instructors are provided support to gain insight into their class's behaviors during group assessments, specifically a better understanding at the group-level. Concerns of students working with their assigned group, free-loading and domination, and adhering to class policies (e.g. group assessments with roles, students must take on each role at least once) still remain and left up to the instructor to address either relying on students to comply without guidance or enforcement or having pull data as needed and creating scripts or manually determining how students are doing, perhaps when the opportune time to intervene has since passed.  

## Goals: 
* Deliver Group Statistics so instructors have a high-level idea of groups' performances; quickly identify potentially struggling groups, signs of potential free-loading or domination
* Allow filters and parameters to serve a variety of instructor needs

# Proposed Solution
Adding a Group Statistics tab (`pages/instructorGroupStatistics`) to the Course Instance-level where PrairieLearn will provide statistics on group performances across group submissions. 

**Input:** CSV of desired group assignments to compare against. 
Also add a button to compute/recompute statistics when needed. 

**Output:** Tables and other visualizations of group performances and student performances with respect to a group; downloadable stats.


# Drawbacks
* Statistics may not be the desired statistics for some instructors, forcing instructors to still develop their own scripts to extract desired information out of data.

# Alternatives

## No Group Statistics Support
* Instructors provide intended group assignments and instructions for group assessments and assume students comply.
* Instructors periodically download data from group assessments and run against their own scripts to gain an understanding of their students during groupwork.

## Add Group Statistics at Assessment Level
* Instructors aggregate statistics across assessments to get information they desire.

# Potential Future Enhancements
* Instructors are able to select a desired groups assignment from an existing assessment assignment.
* Support for multiple different group assignments to have statistics displayed
* Ability to click on a group and an assessment and be directed directly to their assessment to inspect
* Add additional statistics as requested


# Unresolved Questions and Concerns
The existing codebase currently has all group-related code at the assessment-level, it is unclear how to upload, store,and work with group assignments at the course-instance level.
