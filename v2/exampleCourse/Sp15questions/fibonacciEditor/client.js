
define(["SimpleClient", "text!./question.html", "text!./answer.html", "ace/ace"], function(SimpleClient, questionTemplate, answerTemplate, ace) {
    return new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate});
});

function getEditor() {
    var editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setUseWrapMode(true);
    editor.setShowPrintMargin(false);
    editor.setOptions({
      fontSize:"12pt"
    });

    editor.getSession().on('change', function(e) {
      document.getElementById('hiddenBuffer').value = editor.getValue();
      var evt = new Event("input");
      document.getElementById('hiddenBuffer').dispatchEvent(evt);
    });

    return editor;
}
