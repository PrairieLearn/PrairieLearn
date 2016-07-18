document.questionClients = document.questionClients || {};

document.questionClients.Calculation = {};
var client = document.questionClients.Calculation;

client.initialize = function(callback) {
    callback(null);
};

client.renderQuestion = function() {
};

client.getSubmittedAnswer = function(container) {
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
