function FreeformClient() {
};

FreeformClient.prototype.initialize = function(questionData, callback) {
    callback(null);
};

FreeformClient.prototype.renderQuestion = function(container, questionData) {
};

FreeformClient.prototype.renderSubmission = function(container, questionData) {
};

FreeformClient.prototype.renderAnswer = function(container, questionData) {
};

FreeformClient.prototype.getSubmittedAnswer = function(container, questionData) {
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
document.questionClients.Freeform = FreeformClient;
