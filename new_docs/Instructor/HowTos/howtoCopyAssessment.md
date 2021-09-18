# How to make a copy of an existing assessment

You can make a copy of an existing assessment inside the same course instance. This can be very useful if you have many instances of the same assessment set, for example, "Homework 1", "Homework 2", etc.


* Select the assessment from the `Assessments` page.

* Navigate to the `Settings` tab and click `Make a copy of this assessment`. A copy will be made, and you will be taken to the `Settings` tab of this new copied assessment.  

* Click `Change AID` to change the assessment ID name.

* Click the `Edit` button next to the `infoAssessment.json` file.

* Update all the relevant properties, for example, `title` and `number`.

* You will need to adjust `allowAccess` to change the [start and end dates of the assessment](assessmentAccess.md).

* You will need to adjust `zones` to [add new questions to the assessment](addQuestions.md).

* Click `Save and sync`.

* Navigate back to the Assessments page by clicking `Assessments` from the top bar menu.


There is no functionality for copying over individual assessments from previous semesters; the easiest way to use content from a previous semester is to [copy a previous course instance](howtoCopyCourseInstance.md)
