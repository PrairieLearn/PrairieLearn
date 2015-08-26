
# ChangeLog

* __1.4.1__ - 2015-08-26

  * `export.csv` now uses test `set` rather than `type` for test names.

* __1.4.0__ - 2015-08-25

  * Add documentation and help text for Sync page.

  * Fix display of commit information when using older versions of git.

  * Add figure to example question `addVectors` in `exampleCourse`.

* __1.3.2__ - 2015-08-24

  * Fix `allowAccess` checks to not always fail.

* __1.3.1__ - 2015-08-24

  * Fix `pulls` error when `gitCourseBranch` is not set.

* __1.3.0__ - 2015-08-24

  * Change default `allowAccess` to block all non-instructor access.

* __1.2.1__ - 2015-08-24

  * Fix race condition in user creation and correctly record user names.

* __1.2.0__ - 2015-08-23

  * Add "Sync" feature to pull from a git repository.

  * Fix missing `template` field in `config.json` schema.

  * Improve error logging with more specific error information.

* __1.1.0__ - 2015-08-22

  * Add access logging to the database.

* __1.0.2__ - 2015-08-19

  * Documentation fixes following the bootcamp.

  * Fix undefined logger error if `config.json` contains errors (reported by Craig and Mariana).

* __1.0.1__ - 2015-08-18

  * Fix `npm` module list during bootcamp (remove `nodetime`, add `moment`).

* __1.0.0__ - 2015-08-18

  * First public release for pre-Fall-2015 bootcamp.
