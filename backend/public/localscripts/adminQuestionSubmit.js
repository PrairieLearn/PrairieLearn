var submit = function(event) {
    var questionContainer = $(event.target).parents(".question-container");

    var questionData = null;
    questionContainer.find(".question-data").each(function(i, x) {questionData = JSON.parse(x.innerHTML);});

    var client = document.questionClients[questionData.question.type];
    var clientContainer = questionContainer.find(".question-body");
    var submittedAnswer = client.getSubmittedAnswer(clientContainer);

    var postData = {
        action: "submitQuestionAnswer",
        submittedAnswer: submittedAnswer,
        questionInstance: questionData.questionInstance,
    };
    questionContainer.find('form.question-form input').val(JSON.stringify(postData));
    questionContainer.find('form.question-form').submit();
};

$(function() {
    $(".question-container .question-submit").click(submit);
});
