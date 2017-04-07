
define(["SimpleClient", "text!./question.html", "text!./answer.html", "text!clientCode/externally_graded_submission.html", "ace/ace", "underscore"], function(SimpleClient, questionTemplate, answerTemplate, submissionTemplate, ace, _) {

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, submissionTemplate: submissionTemplate});

    client.on('renderQuestionFinished', function() {
        client.addAnswer('files');

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

        if (client.submittedAnswer.has('files')) {
            var files = client.submittedAnswer.get('code')
            _.each(files, function(file) {
                if (file.name === 'fib.py') {
                    editor.setValue(file.contents);
                }
            });
        }

        editor.getSession().on('change', function(e) {
            var files = [{
                name: 'fib.py',
                contents: editor.getValue(),
            }];
            client.submittedAnswer.set('files', files);
        });
    });

    return client;
});
