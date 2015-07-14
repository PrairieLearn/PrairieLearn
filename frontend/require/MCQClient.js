
define(["underscore", "SimpleClient"], function(_, SimpleClient) {

    function MCQClient(options) {
        SimpleClient.SimpleClient.call(this, options);
        this.options.questionTemplate = '<p>{{params.text}}</p><% for (var i = 0; i < params.answers.length; i++) %><div class="radio"><label><input type="radio" name="selection" value="<%= params.answers[i].key %>" data-checked="submittedAnswer.key" />(<%= params.answers[i].key %>) <%= params.answers[i].text %></label></div>';
        this.options.answerTemplate = '<p>Correct answer: ({{trueAnswer.key}})</p>';
    }
    MCQClient.prototype = new SimpleClient.SimpleClient();
    
    return {
        MCQClient: MCQClient,
    };
});
