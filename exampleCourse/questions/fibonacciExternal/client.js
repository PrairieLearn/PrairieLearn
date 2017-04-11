
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

        // We have to decode from base-64
        if (client.submittedAnswer.has('files')) {
            var files = client.submittedAnswer.get('files')
            _.each(files, function(file) {
                if (file.name === 'fib.py') {
                    editor.setValue(atob(file.contents));
                }
            });
        }

        // Note: file is base-64 encoded!
        editor.getSession().on('change', function(e) {
            var files = [{
                name: 'fib.py',
                contents: btoa(editor.getValue()),
            }];
            client.submittedAnswer.set('files', files);
        });
    });

    return client;
});
