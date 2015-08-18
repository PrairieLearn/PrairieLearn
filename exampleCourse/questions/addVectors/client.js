
define(["SimpleClient", "text!./question.html", "text!./answer.html"], function(SimpleClient, questionTemplate, answerTemplate) {
    return new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate});
});
