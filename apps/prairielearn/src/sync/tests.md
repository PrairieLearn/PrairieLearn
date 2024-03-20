# Testing plan

We'll test two different types of syncs:

- **Fresh sync**: Syncing a course for the very first time. In this case, we just need to ensure that all the correct entities have been created in the DB. In other words, we're only checking that things exist. This will likely be just a single test case that makes a large number of assertions after a single sync.

- **Incremental sync**: Syncing a course that already exists. In this case, we also need to check that the correct things happen in the case of updates and deletions. So we're checking that new things have been created, existing things have been updated, and removed things have been deleted (possible soft-deleted).

The following tables are potentially modified during a sync:

- `course_instances`
- `assessments`
- `assessment_sets`
- `topics`
- `tags`
- `course_instance_access_rules`
- `assessment_access_rules`
- `zones`
- `alternative_groups`
- `assessment_questions`
- `questions`
- `question_tags`
- `users`
- `enrollments`

## `infoCourse.json`

### Fresh sync

- Course is created in the `course_instances` table
- Assessment sets are created in the `assessment_sets` table
- Topics are created in the `topics` table
- Tags are created in the `tags` table

### Incremental sync

- Course name/title/options are modified

  - Modification should be reflected in the DB

- An assessment set is added
  - The assessment set should be added to the `assessment_sets` table
- An assessment set is modified
  - The assessment set should be updated in the `assessment_sets` table
- An assesment set is removed

  - The assesment set should be deleted from the `assessment_sets` table
  - Sync should error if any assessments still reference this assessment set

- A topic is added
  - The topic should be added to the `topics` table
- A topic is modified
  - The topic should be updated in the `topics` table
- A topic is removed

  - The topic should be deleted from the `topics` table
  - Sync should error if any question still references the topic

- A tag is added
  - The tag should be added to the `tags` table
- A tag is modified
  - The tag should be updated in the `tags` table
- A tag is removed

  - The tag should be deleted from the `tags` table
  - Sync should error if any question still references the tag

- Course staff is added
  - New users, if needed, are created in `users`
  - Enrollments are created in the `enrollments` table
- Course staff is removed
  - Enrollments are downgraded to `Student` in the `enrollments` table
- Course staff role is changed
  - Enrollment is updated to the appropriate role in the `enrollments` table

## `infoCourseInstance.json`

### Fresh sync

- Course instances are created in the `course_instances` table
- Course instance access rules are created in the `course_instance_access_rules` table

### Incremental sync

- A course instance is added
  - A new course instance should be created in the `course_instances` table
  - Associated access rules should be created in the `course_instance_access_rules` table
- A course instance short name/long name/timezone is updated
  - The course instance should be updated in the `course_instances` table
- A course instance is removed
  - The course instance should be soft-deleted
  - Any associated access rules should be deleted
- A course instance with a previously existing UUID is added again

  - The course instance should be set to have `deleted_at = NULL`
  - The course instance access rules should be created in the `course_instance_access_rules` table

- A course instance access rule is added
  - A new access rule should be created in the `course_instance_access_rules` table
- A course instance access rule is changed
  - The access rule should be updated in the `course_instance_access_rules` table
- A course instance access rule is deleted
  - The access rule should be deleted from the `course_instance_access_rules` table

## `infoAssessment.json`

## Fresh sync

- Assessments are created in the `assessments` table
- Access rules are created in the `assessment_access_rules` table
- Zones are created in the `zones` table
- Alternative groups are created in the `alternative_groups` table
- Assessment questions are created in the `assessment_questions` table

## Incremental sync

- A zone is added
  - A new zone is created in the `zones` table
  - Alternative groups are created in the `alternative_groups` table
  - Assessment questions are created in the `assessment_questions` table
- A zone is removed
  - The zone is removed from the `zones` table
  - The zone's alternative groups are removed from the `alternative_groups` table
  - The assessment questions under the zone are soft-deleted
- An assessment uses a `set` that does not exist in the course
  - An error should be thrown

## `question.json`

## Fresh sync

- Questions are created in the `questions` table
- Question tags are created in the `question_tags` table

## Incremental sync

- A question is added
  - Questions are created in the `questions` table
  - Question tags are created in the `question_tags` table
- A question is deleted
  - The question is soft-deleted from the `questions` table
  - The question's tags are deleted from the `question_tags` table
- A question is modified (excluding tags)
  - The changed attributes are reflected in the `questions` table
- A question's tags are modified
  - The old tags are removed from the `question_tags` table
  - The new tags are removed from the `questions` table
- A question with a previously-existing UUID is added again
  - The question is set to have `deleted_at = NULL`
  - The question's tags are created in the `question_tags` table

# Observed behavior to maybe test

- Questions have a ton of default/implicit behavior, including...
  - `grading_method` is inferred
  - `client_files` defaults to `[ 'client.js', 'question.html', 'answer.html' ]`
  - `single_varient` defaults to false
  - `partial_credit` defaults to true for `v3`
