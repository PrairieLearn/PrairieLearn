
define(["SimpleClient", "text!./question.html", "text!./answer.html", "text!./submission.html", "ace/ace"], function(SimpleClient, questionTemplate, answerTemplate, submissionTemplate, ace) {
    
    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on('renderQuestionFinished', function() {
		client.addAnswer('code');
        
        ace.config.set("packaged", true)
        ace.config.set("basePath", require.toUrl("ace"))
        var editor = ace.edit('editor');
        editor.setTheme("ace/theme/chrome");
        editor.getSession().setMode("ace/mode/python");
        editor.getSession().setUseWrapMode(true);
        editor.setShowPrintMargin(false);
        editor.setOptions({
            fontSize: "10pt",
        });
        if (client.submittedAnswer.has('code')) {
            editor.setValue(client.submittedAnswer.get('code'));
        }
        
        editor.getSession().on('change', function(e) {
            client.submittedAnswer.set('code', editor.getValue());
        });
    });

    return client;
});
