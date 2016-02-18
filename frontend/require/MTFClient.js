
define(["underscore", "SimpleClient"], function(_, SimpleClient) {

    function MTFClient(options) {
        SimpleClient.SimpleClient.call(this, options);
        this.options.questionTemplate = '<p><%= params.text %></p><p>' +
          '<% for (var i = 0; i < params.statements.length; i++) { %>' +
            '<div class="trueFalse" style="display:table; width:100%;">' +
              '<div style="display:table-row; width:100%;">' +
                '<div style="display:table-cell; width:80%; padding:0.75em; border-bottom:1px solid black">' +
                  '<%= params.statements[i].statement %>' +
                '</div>' +
                '<div style="display:table-cell; text-align:center; width:20%; padding:0.75em;border-bottom:1px solid black; vertical-align:middle;">' +
                  '<label>' +
                    '<input type="checkbox" data-checkedoptional="submittedAnswer.<%= params.statements[i].key %>-true" />' +
                    ' True' +
                  '</label>' +
                  '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' +
                  '<label>' +
                    '<input type="checkbox" data-checkedoptional="submittedAnswer.<%= params.statements[i].key %>-false" />' +
                    ' False' +
                  '</label>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '<% } %>';

        this.options.answerTemplate = '<p>true Answers: <% if (trueAnswer.trueAnswers.length == 0) { %>None.<% } %></p>'
            + '<% for (var i = 0; i < trueAnswer.trueAnswers.length; i++) { %>'
            + '<p><%= trueAnswer.trueAnswers[i].toString().charAt(0).toUpperCase() + trueAnswer.trueAnswers[i].toString().slice(1) %></p>'
            + '<% } %>';
    }

    MTFClient.prototype = new SimpleClient.SimpleClient();

    return {
        MTFClient: MTFClient,
    };
});

/* And here's the part that handles mutual exclusion. */

$(document).on('change', 'input[type=checkbox]', function() {
  console.log('change');
  var questionId = $(this).attr('data-checkedoptional').split('.')[1].split('-')[0];
  var currChoice = $(this).attr('data-checkedoptional').split('.')[1].split('-')[1];
  var otherChoice = currChoice === 'true' ? 'false' : 'true';
  var currSubmittedAnswer = 'submittedAnswer.' + questionId + '-' + currChoice;
  var otherSubmittedAnswer = 'submittedAnswer.' + questionId + '-' + otherChoice;

  if($('input[data-checkedoptional="' + otherSubmittedAnswer + '"]').prop('checked')) {
    $('input[data-checkedoptional="' + otherSubmittedAnswer + '"]').click().blur();
  }
});
