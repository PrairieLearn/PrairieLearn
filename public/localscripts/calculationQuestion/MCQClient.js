define(['underscore', 'SimpleClient'], function (_, SimpleClient) {
  function MCQClient(options) {
    SimpleClient.SimpleClient.call(this, options);
    this.options.questionTemplate =
      '<p><%= params.text %></p><% for (var i = 0; i < params.answers.length; i++) { %><div class="form-check"><label class="form-check-label"><input class="form-check-input" type="radio" name="selection" value="<%= params.answers[i].key %>" data-checked="submittedAnswer.key" />(<%= params.answers[i].key %>) <%= params.answers[i].text %></label></div><% } %>';
    this.options.answerTemplate = '<p>(<%= trueAnswer.key %>) <%= trueAnswer.text %></p>';
    this.options.submissionTemplate = '<p>(<%= submittedAnswer.key %>)</p>';
    this.options.templateTwice = true;
  }
  MCQClient.prototype = new SimpleClient.SimpleClient();

  return {
    MCQClient: MCQClient,
  };
});
