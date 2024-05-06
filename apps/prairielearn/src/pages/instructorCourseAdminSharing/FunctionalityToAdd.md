- Picking the course sharing name: You'll need to add a new route and handler for updating the course sharing name. This handler should first check if any questions have been imported from the course. If not, it should update the sharing name.
    1. Needs a 'check_imported_questions' and 'update_sharing_name' SQL queries

- Creating sharing set: This seems to be already implemented.

- Deleting a sharing set: You'll need to add a new route and handler for deleting a sharing set. This handler should check if the sharing set is being used (i.e., a course has been given permission to the sharing set, a question has been added to the sharing set, and someone is using the permission granted by that sharing set to import a question into their course). If not, it should delete the sharing set.

- Renaming a sharing set: You'll need to add a new route and handler for renaming a sharing set. This handler should simply update the name of the sharing set.

- Sharing a sharing set with a course: You'll need to add a new route and handler for revoking sharing set permissions from a course. This handler should check if the course is importing any questions from the sharing set. If not, it should revoke the permissions.

- Adding a question to a sharing set: You'll need to add a new route and handler for removing a question from a sharing set. This handler should check if anyone is importing the question with permissions granted by the sharing set. If not, it should remove the question from the sharing set.