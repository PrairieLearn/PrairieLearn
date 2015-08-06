
## User Roles

Each user has a single role assigned to them. These are:

Role         | Meaning
-            | -
`Student`    | A student participating in the class. They can only see their own information, and can do do tests.
`TA`         | An assistant instructor. They can see the data of all users, but can only edit their own information.
`Instructor` | A person in charge of the course. Has full permission to see and edit the information of other users.

The detailed list of permissions for each role is given below.

Operation                                                             | Student | TA    | Instructor
-                                                                     | -       | -     | -
`overrideScore`: Submit question answers with pre-determined scores.  |         |       | Yes
`overrideVID`: Load specific (non-random) instances of questions.     |         | Yes   | Yes
`seeQID`: See question ID strings.                                    |         | Yes   | Yes
`viewOtherUsers`: View data from other users.                         |         | Yes   | Yes
`editOtherUsers`: Edit data from other users.                         |         |       | Yes
`changeMode`: Change the current interface mode (Public/Exam).        |         |       | Yes
`seeAvailDate`: See the date availability information for tests.      |         | Yes   | Yes
`bypassAvailDate`: Access tests outside of the availble date range.   |         | Yes   | Yes
