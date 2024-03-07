var httpDownloadPrefix = 'data:text/plain;base64,';

define(['SimpleClient', 'text!./question.html', 'text!./answer.html'], function (
  SimpleClient,
  questionTemplate,
  answerTemplate,
) {
  var simpleClient = new SimpleClient.SimpleClient({
    questionTemplate: questionTemplate,
    answerTemplate: answerTemplate,
  });

  function updateTemplate() {
    var _fileData;
    if ((_fileData = simpleClient.submittedAnswer.get('fileData'))) {
      $('#downloadFileLink')
        .show()
        .attr('href', httpDownloadPrefix + encodeURIComponent(_fileData));
    } else {
      $('#downloadFileLink').hide();
    }
  }

  simpleClient.on('renderQuestionFinished', function () {
    $('#fileUpload').change(function (evt) {
      var file = evt.target.files[0];

      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;

        var commaSplitIdx = dataUrl.indexOf(',');

        // Store the prefix read from the file (so the grading script could parse the file type if necessary)
        var dataPrefix = dataUrl.substring(0, commaSplitIdx);
        simpleClient.submittedAnswer.set('dataPrefix', dataPrefix);

        // Store the data as base64 encoded data
        var base64FileData = dataUrl.substring(commaSplitIdx + 1);
        simpleClient.submittedAnswer.set('fileData', base64FileData);
      };

      reader.readAsDataURL(file);
    });

    simpleClient.submittedAnswer.bind('change', function () {
      updateTemplate();
    });

    simpleClient.addAnswer('dataPrefix');
    simpleClient.addAnswer('fileData');
  });

  return simpleClient;
});

if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
  alert(
    'Warning: Your browser does not fully support HTML5 file upload operations.' +
      'Please use a more current browser or you may not be able to complete this question.',
  );
}
