
define(["clientCode/MultiFileClient", "text!./question.html", "text!clientCode/externally_graded_submission.html"], function(MultiFileClient, questionTemplate, submissionTemplate) {
    return MultiFileClient(questionTemplate, submissionTemplate);
});
