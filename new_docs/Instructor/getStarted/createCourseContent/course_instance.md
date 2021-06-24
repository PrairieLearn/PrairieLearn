# Creating a course instance

A course instance corresponds to a single offering of a course, such as "Fall 2020", or possibly "Fall 2020, Section M".   We will create a course instance for Math 101 to take place in the Fall of 2021.  Follow the steps below to create a new course instance:

* You should automatically be directed to the `Course Instances` tab.  If not, navigate to this tab.

* Click the button `+ Add course instance`.  A new instance will be generated, with the placeholder name "New (1)".  You will be automatically directed to the instance's `Settings` tab.

* Click the button `Change CIID` to change the course instance ID name. Typically we recommend using a short version of the course instance name; for our course in Fall 2021, we choose the name `Fa21`.  After changing the CIID, click `Change` to save.

* Next, we will change the configuration of the course through the `infoCourseInstance.json` file.  Select the `Edit` button next to the json file name.

#### infoCourseInstance.json

The file will open in an editing window in your browser.  You will see the following items:

* `uuid` - This is the course's "universally unique identifier", which was generated automatically.  This does not need to be changed.

* `longName` - This is the full name of your course instance, as it will appear on your list of course instances.  Replace the name "New (1)" with the name of the instance.  In this case, we will type:

```json
"longName": "Fall 2021",
```

Make sure a comma separates the name from the next item `userRoles`

* `userRoles` - This lists the users associated with the course instance.  The roles will be initialized as:

```json
"userRoles": {
    "your_email@school.edu": "Instructor"
},
```

By default, you are an instructor for the course instance.  You can add other instructors and teaching assistants, but we'll leave this unchanged for now.  For a list of possible roles, see [roles](courseInstance.md#user-roles).

* `allowAccess` - The dates in which your course will be available.  (See other  [access options](courseInstance.md#course-instance-allowaccess).)  For this example, we will assume our semester runs from August 16, 2021 until December 17, 2021.  Thus, we will enter:


```json
"allowAccess": [
    {
        "startDate": "2021-08-16T00:00:01",
        "endDate": "2021-12-17T23:59:59"
    }
]
```

So this course instance will become available at 12:01 AM on August 16, and will close at 11:59 PM on December 17.  Notice that a pair of square brackets and a pair of curly braces are used.

* To save your changes, click `Save and sync`.

* Navigating back to your course by clicking on `Math 101`, you will now see the `Fall 2021` under the Course instances tab.
