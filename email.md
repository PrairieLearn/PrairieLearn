Subject: Changes to Question Sharing in PrairieLearn

First, I want to say thank you again for being one of our Beta users of PrairieLearn's question sharing features.

We will be pushing some updates to the question sharing system soon that will require some action on your part to ensure your course continues to sync correctly.

Specifically, the sharing configuration of questions will be specified in JSON files to allow easier bulk editing of sharing information (rather than only being edited in the web user interface).

As of now, we will not support un-sharing questions (we will in the future), so once the deployments happens, the sharing configuration you have in your JSON will need to match what you have done in the Web UI in order for the sync to succeed.

Sharing info will be specified with the following properties: 
In your `infoCourse.json`, you will need to list all of the sharing sets that you have, e.g.:

...

"sharingSets": [
{"name": "python-exercises", "description": "Python exercises for sharing"},
{"name": "final-exam", "description": "Questions that can be used on a final exam"}
]
...

In your `info.json` for each question, you will need to specify the sharing configuration for that question with the properties "sharingSets" and "publiclyShared", e.g.:

...
"sharingSets": [
"final-exam"
],
"publiclyShared": true,
...

To help in this process, I have attached a python script which can be used to bulk-update the sharing info in the info.json files of your questions, as well as the list of the questions you currently have shared (publicly and through sharing sets). Please copy the files "insert_sharing_info.py", "question_sharing_info.csv", "sharing_sets.csv" into your course directory, and then run `python insert_sharing_info.py` in that directory. While this script will insert all the appropriate sharing configuration in your JSON files, it also may reformat them. You can feel free to re-run your usual JSON file formatter on them afterward.

Starting now, you are able to add these properties to your JSON files, but they will be ignored on sync.

Once we deploy the changes to question sharing on _14 October 2024_, the sharing info will be required in the JSON in order for syncing your course to succeed.

Please let me know if you need any assistance with this.

Thanks!
