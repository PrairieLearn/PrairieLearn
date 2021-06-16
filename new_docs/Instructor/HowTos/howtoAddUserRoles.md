# Adding Staff to a Course Instance

You can add staff to your course instance at any point.  There are two roles that can be granted to staff.

## Roles

* `TA` - Teaching Assistant.  They have access to the data of all users, but can only edit their own information.

* `Instructor` - A person in charge of the course.  They have full permission to see and edit the information of other users.

You can also check other [user roles](courseInstance.md#user-roles).

## Giving access

* Select the `Course Instances` tab, and select instance for which you are adding staff.

* Navigate to `Settings` tab, and click the `Edit` button next to the course configuration file infoCourseInstance.json.

* Under `userRoles`, add the email address of each new staff member, followed by their role: `address@email.com": "role"`  Separate each entry by a comma.  For example:

```json
"userRoles": {
    "lecturer1@illinois.edu": "Instructor",
    "ta1@illinois.edu": "TA",
    "ta2@illinois.edu": "TA"
}
```

* Click `Save and Sync` to finish adding staff.
