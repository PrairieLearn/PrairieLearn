## Make a Copy of a Course Instance

If you are teaching a course in multiple semesters, you can easily copy over information into a new course instance.

* Select your course number from the top menu in Prairielearn (e.g., XC 101)

* Go to the `Course Instances` tab, and select the previous course instance you would like to duplicate.

* Navigate to the `Settings` tab and click `Make a copy of this course instance`.

* A copy will be made, and you will be taken to the `Settings` tab of the new copied instance.  Select `Change CIID` to change the instance's ID.

* `Edit` the file `infoCourseInstance.json` to change the title of the course instance (in `longName`).  The `uuid` is automatically generated and does not need to be changed.

* Adjust `userRoles` if needed; i.e. add new course staff or remove TA's who are no longer assisting with the course.

* You will need to adjust `allowAccess` to change the start and end date of the course instance, as well as any other [access Rules](course.md/#accessrules) you need.  They are copied over from the previous instance automatically.

* You will also need to adjust `allowAccess` for Assessments that are copied over from the previous instance.
