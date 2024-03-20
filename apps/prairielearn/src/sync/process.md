## Goals

- For partial sync, be safe
  - If we might get an inconsistency, fall back to full sync
- For a complete sync, be resilient (but also safe)
  - Be tolerant to errors in JSON
    - If a JSON file parses incorrectly or fails validation, report the error to the user but don’t fail the sync
    - However, also don’t delete or otherwise modify things for which we have an invalid JSON file

## Definitions

- **Valid file**: a JSON file is at the expected path and is neither malformed nor failed schema/other validation
- **Invalid file**: a JSON file is at the expected path, but is malformed or does not pass schema/other validation
- **Missing file**: a JSON file is not present at the expected path

## Partial sync

- Check if a partial sync is possible
  - Does the thing being synced have a UUID? If so:
    - If there is an existing entity with the ID of the one being synced but the UUID did not match, fall back to full sync
    - If there is no existing entity with this ID but there was another entity with the same UUID, fall back to full sync
- Load and validate the relevant `info.json` file
  - If this fails, fail sync with a detailed error message
- Are we syncing an assessment? If so…
  _ Load a list of QIDs in the database
  _ Validate the collection of QIDs used in the assessment against the list of QIDs in the course \* If validation fails, fail sync with an error message

## Full sync

- Load and validate entire course
  - If the file `infoCourse.json` does not or is not valid, alert the user with a detailed error message and continue sync
  - If the file `infoCourse.json` exists and is valid, record the course and all associated tags/topics for syncing
  - Loop over each subdirectory \$QID in the `questions` directory
    - If the file `info.json` is missing, count this question as not existing (note that this means that if the question previously existed, the question will later be soft-deleted from the DB)
    - If the file is invalid, report the error to the user but note that question \$QID does exist and should not be removed from the DB if it’s already there; add \$QID to \$INVALID_SYNCING_QIDS
    - If the file is valid, record the question for syncing and add \$QID to the set \$VALID_SYNCING_QIDS
  - Load a list of QIDs currently in the database into the set \$VALID_DB_QIDS
  - Store the union of (\$VALID_DB_QIDS - (\$VALID_SYNCING_QIDS union \$INVALID_SYNCING_QIDS) into \$VALID_QIDS
  - Load a list of CIIDs/TIDs currently in the course into the set \$VALID_DB_TIDS
  - Loop over each subdirectory in \$CIID in the `courseInstances` directory
    - If the file `infoCourseInstance.json` is missing:
      - Count this course instance as not existing (note that this means that if the course instance previously existed, the course instance will later be soft-deleted from the DB)
      - Abort loading this course instance (note that this means that if the course instance previously existed, any assessments/assessment questions will later be soft-deleted and any zones/alternative groups will be fully deleted)
    - If the file is invalid:
      - Set \$INVALID_CI = TRUE
      - Add \$CIID to \$INVALID_SYNCING_CIIDS
      - Report the error to the user but note that the course instance \$CIID does exist and should not be removed from the DB if it’s already there
    - If the file is valid, record the course instance for syncing and add \$CIID to \$VALID_CIIDS
    - Loop over each subdirectory \$TID in the \$CIID/assessments directory
      - If the file `infoAssessment.json` is missing, count this assessment as not existing (note that this means that if the assessment previously existed, the assessment/assessment questions will later be soft deleted and any zones/alternative groups will be fully deleted)
      - If the file is invalid, report the error to the user but note that assessment \$TID does exist and should not be removed from the DB if it’s already there; add \$TID to \$INVALID_SYNCING_TIDS for this course instance
        - Note that we validate QIDs in assessments based on \$VALID_QIDS
      - If the file is valid and (either (CI in DB) or (\$INVALID_CI != TRUE)), record the assessment for syncing; add \$TID to \$VALID_SYNCING_TIDS for this course instance
- Write changes to DB
  - If we have a valid course to sync, sync it
  - If we have a valid course to sync, sync all topics/tags/assessment sets from it to the DB
  - If we do not have a valid course to sync, still sync all topics/tags/assessment sets from all valid questions and assessments to the DB, creating missing ones if necessary but not overwriting existing info from a previous successful course sync
  - Sync course instances
    - Create/update all valid course instances
    - Remove excess course instances as defined as course instances not in (\$VALID_SYNCING_CIIDS union \$INVALID_SYNCING_QIDS)
  - Sync questions
    - Create/update all valid questions
    - Delete excess questions as defined as questions not in (\$VALID_SYNCING_QIDS union \$INVALID_SYNCING_QIDS)
  - Sync question tags
  - Sync assessments for all valid course instances
    - Create/update all valid assessments for a given course instance
    - Delete excess assessments for a given course instance as defined as assessments not in (\$VALID_SYNCING_TIDS union \$INVALID_SYNCING_QIDS)

## Special considerations

Currently, an edit operation is keyed by QID/etc.; we don't allow entities to be renamed in the browser. However, we'll want to allow that someday. There are a number of interesting cases here:

- We rename and keep the UUID the same. Since all entities are unique (in their course/course instance scope), we can rely on a conflict and subsequent overwrite to take case of the "deletion" of the old entity.
- We rename and change the UUID in one edit operation. We can either a) disallow this entirely or b) detect this and fall back to a full sync.
- We rename a question that is referenced by one or more assessments. We'll need a full sync to handle this properly.

The first case is the only one that we can optimize with a partial sync. Given that, I propose that we don't attempt to be clever with renames. Whatever piece of code is handling edits should detect a rename and unconditionally do a full sync.

Normally, we'll be able to gracefully recover from a failure to load/find `infoCourse.json`. However, the only case where we can't do this is if the course does not yet exist in the database. We need to check for that, and if that's the case, prevent syncing until we can ensure that the course either is in the DB or will be created.
