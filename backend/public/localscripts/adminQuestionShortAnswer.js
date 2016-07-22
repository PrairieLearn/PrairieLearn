function ShortAnswerClient() {
};

ShortAnswerClient.prototype.initialize = function(questionData, callback) {
    callback(null);
};

ShortAnswerClient.prototype.renderQuestion = function(container, questionData) {
};

ShortAnswerClient.prototype.renderSubmission = function(container, questionData) {
};

ShortAnswerClient.prototype.renderAnswer = function(container, questionData) {
};

ShortAnswerClient.prototype.getSubmittedAnswer = function(container, questionData) {
    var submittedAnswer = {};
    container.find('input[data-instavalue^="submittedAnswer."]').each(function(i, x) {
        _(x.attributes).each(function(a) {
            if (a.nodeName == "data-instavalue") {
                var m = a.value.match(/^submittedAnswer[.](.*)$/);
                if (m) {
                    var subVar = m[1];
                    submittedAnswer[subVar] = x.value;
                }
            }
        });
    });
    return submittedAnswer;
};

document.questionClients = document.questionClients || {};
document.questionClients.ShortAnswer = ShortAnswerClient;
