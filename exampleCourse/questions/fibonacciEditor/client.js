
define(["SimpleClient", "text!./question.html", "text!./answer.html", "text!clientCode/externally_graded_submission.html", "ace/ace", "underscore"], function(SimpleClient, questionTemplate, answerTemplate, submissionTemplate, ace, _) {

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, submissionTemplate: submissionTemplate, skipRivets: true});

    client.on('renderQuestionFinished', function() {
        client.addAnswer('_files');

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

        // https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
        function b64EncodeUnicode(str) {
            // first we use encodeURIComponent to get percent-encoded UTF-8,
            // then we convert the percent encodings into raw bytes which
            // can be fed into btoa.
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                                                        function toSolidBytes(match, p1) {
                                                            return String.fromCharCode('0x' + p1);
                                                        }));
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
        function b64DecodeUnicode(str) {
            // Going backwards: from bytestream, to percent-encoding, to original string.
            return decodeURIComponent(atob(str).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        }
        
        // We have to decode from base-64
        if (client.submittedAnswer.has('_files')) {
            var files = client.submittedAnswer.get('_files')
            _.each(files, function(file) {
                if (file.name === 'fib.py') {
                    editor.setValue(b64DecodeUnicode(file.contents));
                }
            });
        }

        // Note: file is base-64 encoded!
        editor.getSession().on('change', function(e) {
            var files = [{
                name: 'fib.py',
                contents: b64EncodeUnicode(editor.getValue()),
            }];
            client.submittedAnswer.set('_files', files);
        });
    });

    return client;
});
