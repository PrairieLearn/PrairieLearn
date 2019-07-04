# Testing plan

We'll test two different types of syncs:

* **Fresh sync**: Syncing a course for the very first time. In this case, we just need to ensure that all the correct entities have been created in the DB. In other words, we're only checking that things exist. This will likely be just a single test case that makes a large number of assertions after a single sync.

* **Incremental sync**: Syncing a course that already exists. In this case, we also need to check that the correct things happen in the case of updates and deletions. So we're checking that new things have been created, existing things have been updated, and removed things have been deleted (possible soft-deleted).

## `infoCourse.json`

### Fresh sync
* Course is created in the `course_instances` table
* Assessment sets are created in the `assessment_sets` table
* Topics are created in the `topics` table
* Tags are created in the `tags` table

### Incremental sync
* Course name/title/options are modified
  * Modification should be reflected in the DB

* An assessment set is added
  * The assessment set should be added to the `assessment_sets` table
* An assessment set is modified
  * The assessment set should be updated in the `assessment_sets` table
* An assesment set is removed
  * The assesment set should be deleted from the `assessment_sets` table
  * Sync should error if any assessments still reference this assessment set

* A topic is added
  * The topic should be added to the `topics` table
* A topic is modified
  * The topic should be updated in the `topics` table
* A topic is removed
  * The topic should be deleted from the `topics` table
  * Sync should error if any question still references the topic

* A tag is added
  * The tag should be added to the `tags` table
* A tag is modified
  * The tag should be updated in the `tags` table
* A tag is removed
  * The tag should be deleted from the `tags` table
  * Sync should error if any question still references the tag


## `infoCourseInstance.json`

### Fresh sync
* Course instances are created in the `course_instances` table
* Course instance access rules are created in the `course_instance_access_rules` table

### Incremental sync
* A course instance is added
  * A new course instance should be created in the DB
* A course instance is removed
  * The course instance should be soft deleted
  * Any associated access rules should be completely deleted
* A course instance with a previously existing UUID is added again
  * The course instance should be set to have `deleted_at = NULL`

## Questions

* A question is added
  * A new question should be created in the DB
* A question is deleted
  * The question is soft deleted, but still present in the DB
* A question is modified
  * The modification should be reflected in the DB


