
define(["underscore", "SimpleClient"], function(_, SimpleClient) {

    function CBQClient(options) {
        SimpleClient.SimpleClient.call(this, options);
        this.options.questionTemplate = '<p><%= params.text %></p>'
            + '<% for (var i = 0; i < params.answers.length; i++) { %>'
            + '<div class="checkbox">'
            + '<label>'
            + '<input type="checkbox" data-checkedoptional="submittedAnswer.<%= params.answers[i].key %>" />'
            + '(<%= params.answers[i].key %>) <%= params.answers[i].text %>'
            + '</label>'
            + '</div>'
            +'<% } %>';
        this.options.answerTemplate = '<p>Correct answers: <% if (trueAnswer.correctAnswers.length == 0) { %>none.<% } %></p>'
            + '<% for (var i = 0; i < trueAnswer.correctAnswers.length; i++) { %>'
            + '<p>(<%= trueAnswer.correctAnswers[i].key %>) <%= trueAnswer.correctAnswers[i].text %></p>'
            + '<% } %>';
    }
    CBQClient.prototype = new SimpleClient.SimpleClient();
    
    return {
        CBQClient: CBQClient,
    };
});
