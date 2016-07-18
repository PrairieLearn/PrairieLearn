$(function() {

    var render = function(questionContainer) {
        var questionData = null;
        questionContainer.find(".question-data").each(function(i, x) {questionData = JSON.parse(x.innerHTML);});

        var client = document.questionClients[questionData.question.type];
        var clientContainer = questionContainer.find(".question-body");
        client.renderQuestion(clientContainer[0], questionData);
    };

    var submit = function(event) {
        var questionContainer = $(event.target).parents(".question-container");

        var questionData = null;
        questionContainer.find(".question-data").each(function(i, x) {questionData = JSON.parse(x.innerHTML);});

        var client = document.questionClients[questionData.question.type];
        var clientContainer = questionContainer.find(".question-body");
        var submittedAnswer = client.getSubmittedAnswer(clientContainer, questionData);

        var postData = {
            action: "submitQuestionAnswer",
            submittedAnswer: submittedAnswer,
            questionInstance: questionData.questionInstance,
        };
        questionContainer.find('form.question-form input').val(JSON.stringify(postData));
        questionContainer.find('form.question-form').submit();
    };

    async.eachSeries(document.questionClients, function(client, callback) {
        client.initialize(callback);
    }, function(err) {
        if (err) return console.log(err);
        $(".question-container").each(function(i, x) {render($(x));});
        $(".question-container .question-submit").click(submit);
    });
});
