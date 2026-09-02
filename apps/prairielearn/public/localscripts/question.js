$(function () {
  var clients = new WeakMap(); // Store one client per question-container div.

  var initialize = function (questionContainer, callback) {
    var questionData = null;
    questionContainer.children('.question-data').each(function (i, x) {
      questionData = JSON.parse(decodeURIComponent(atob(x.innerHTML)));
    });
    var client = new document.questionClients[questionData.effectiveQuestionType]();
    clients.set(questionContainer.get(0), client);
    client.initialize(questionData, callback);
  };

  var render = function (questionContainer) {
    var client = clients.get(questionContainer.get(0));

    var questionData = null;
    questionContainer.children('.question-data').each(function (i, x) {
      questionData = JSON.parse(decodeURIComponent(atob(x.innerHTML)));
    });

    questionContainer.find('.question-body').each(function (i, x) {
      client.renderQuestion(x, questionData);
    });
    questionContainer.find('.submission-body').each(function (i, x) {
      client.renderSubmission(x, questionData, i);
    });
    questionContainer.find('.answer-body:visible').each(function (i, x) {
      client.renderAnswer(x, questionData);
    });
  };

  var submit = function (event, action) {
    var questionContainer = $(event.target).parents('.question-container');
    var client = clients.get(questionContainer.get(0));

    var questionData = null;
    questionContainer.children('.question-data').each(function (i, x) {
      questionData = JSON.parse(decodeURIComponent(atob(x.innerHTML)));
    });

    var clientContainer = questionContainer.find('.question-body');
    var submittedAnswer = client.getSubmittedAnswer(clientContainer, questionData);

    var postData = {
      submittedAnswer: submittedAnswer,
      variant: questionData.variant,
      type: 'score',
    };
    questionContainer.find('form.question-form input.postData').val(JSON.stringify(postData));
    questionContainer.find('form.question-form input.__action').val(action);
    questionContainer.find('form.question-form').submit();
  };

  var grade = function (event) {
    submit(event, 'grade');
  };

  var save = function (event) {
    submit(event, 'save');
  };

  $('.question-container > .question-data')
    .parent()
    .each(function (i, questionContainer) {
      $(questionContainer).attr('data-legacy-question-render-status', 'pending');
      try {
        initialize($(questionContainer), function (err) {
          if (err) {
            $(questionContainer).attr('data-legacy-question-render-status', 'error');
            return console.log(err);
          }
          try {
            render($(questionContainer));
            $(questionContainer).attr('data-legacy-question-render-status', 'complete');
            $(questionContainer).find('.question-grade').click(grade);
            $(questionContainer).find('.question-save').click(save);
          } catch (renderError) {
            $(questionContainer).attr('data-legacy-question-render-status', 'error');
            throw renderError;
          }
        });
      } catch (initializeError) {
        $(questionContainer).attr('data-legacy-question-render-status', 'error');
        throw initializeError;
      }
    });
});
