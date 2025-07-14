define(['jquery', 'underscore', 'backbone', 'rivets', 'PrairieTemplate'], function (
  $,
  _,
  Backbone,
  rivets,
  PrairieTemplate,
) {
  rivets.configure({
    templateDelimiters: ['{{', '}}'],
    adapter: {
      subscribe: function (obj, keypath, callback) {
        obj.on('change:' + keypath, callback);
      },
      unsubscribe: function (obj, keypath, callback) {
        obj.off('change:' + keypath, callback);
      },
      read: function (obj, keypath) {
        return obj.get(keypath);
      },
      publish: function (obj, keypath, value) {
        obj.set(keypath, value);
      },
    },
  });

  rivets.binders.instavalue = {
    publishes: true,
    bind: function (el) {
      return rivets._.Util.bindEvent(el, 'input', this.publish);
    },
    unbind: function (el) {
      return rivets._.Util.unbindEvent(el, 'input', this.publish);
    },
    routine: function (el, value) {
      var _ref;

      el = $(el);
      if (
        (value != null ? value.toString() : void 0) !==
        ((_ref = el.val()) != null ? _ref.toString() : void 0)
      ) {
        return el.val(value != null ? value : '');
      }
    },
  };

  rivets.binders.checkedoptional = {
    publishes: true,
    bind: function (el) {
      return rivets._.Util.bindEvent(el, 'change', this.publish);
    },
    unbind: function (el) {
      return rivets._.Util.unbindEvent(el, 'change', this.publish);
    },
    routine: function (el, value) {
      el.checked = !!value;
      return el.checked;
    },
  };

  rivets.formatters.floatFixed = PrairieTemplate.floatFixedString;
  rivets.formatters.rational = PrairieTemplate.rationalString;
  rivets.formatters.rationalCoeff = PrairieTemplate.rationalCoeffString;
  rivets.formatters.rationalCoeffZero = PrairieTemplate.rationalCoeffZeroString;
  rivets.formatters.vector = PrairieTemplate.vectorString;
  rivets.formatters.vectorInBasis = PrairieTemplate.vectorInBasisString;
  rivets.formatters.cartesianVector = PrairieTemplate.cartesianVectorString;
  rivets.formatters.cylindricalVector = PrairieTemplate.cylindricalVectorString;
  rivets.formatters.vectorFixed = PrairieTemplate.vectorFixedString;
  rivets.formatters.cartesianVectorFixed = PrairieTemplate.cartesianVectorFixedString;
  rivets.formatters.poly = PrairieTemplate.polyString;
  rivets.formatters.parenPoly = PrairieTemplate.parenPolyString;
  rivets.formatters.vectorPoly = PrairieTemplate.vectorPolyString;
  rivets.formatters.cartesianVectorPoly = PrairieTemplate.cartesianVectorPolyString;
  rivets.formatters.scalarCoeff = PrairieTemplate.scalarCoeff;
  rivets.formatters.scalarProduct = PrairieTemplate.scalarProduct;
  rivets.formatters.fcn = PrairieTemplate.fcnString;
  rivets.formatters.parenFcn = PrairieTemplate.parenFcnString;
  rivets.formatters.vectorFcn = PrairieTemplate.vectorFcnString;
  rivets.formatters.cartesianVectorFcn = PrairieTemplate.cartesianVectorFcnString;
  rivets.formatters.directionName = function (dir) {
    return dir > 0 ? 'counterclockwise' : 'clockwise';
  };
  rivets.formatters.directionNameRL = function (dir) {
    return dir > 0 ? 'right' : 'left';
  };
  rivets.formatters.directionNameUD = function (dir) {
    return dir > 0 ? 'up' : 'down';
  };
  rivets.formatters.directionNameIncDec = function (dir) {
    return dir > 0 ? 'increasing' : 'decreasing';
  };

  var QuestionModel = Backbone.Model.extend({
    initialize: function () {
      this.set({
        submittable: false,
        showTrueAnswer: false,
      });
    },
  });

  var QuestionView = Backbone.View.extend({
    initialize: function () {
      this.questionDataModel = this.options.questionDataModel;
      this.appModel = this.options.appModel;
      this.answerAttributes = this.answerAttributes || [];
      this.template = this.options.template;
      this.params = this.options.params;
      this.submittedAnswer = this.options.submittedAnswer;
      this.trueAnswer = this.options.trueAnswer;
      this.feedback = this.options.feedback;
      this.rivetsBindingsActive = false;
      //this.listenTo(this.trueAnswer, "change", this.render);
      //this.listenTo(this.feedback, "change", this.render);
    },

    render: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      var templateData = {
        params: this.params.toJSON(),
        submittedAnswer: this.submittedAnswer.toJSON(),
        trueAnswer: this.trueAnswer.toJSON(),
        feedback: this.feedback.toJSON(),
      };
      var templatedHTML = PrairieTemplate.template(
        this.template,
        templateData,
        this.questionDataModel,
        this.appModel,
      );
      if (this.options.templateTwice) {
        templatedHTML = PrairieTemplate.template(
          templatedHTML,
          {},
          this.questionDataModel,
          this.appModel,
        );
      }
      this.$el.html(templatedHTML);
      if (!this.options.skipRivets) {
        this.rivetsView = rivets.bind(this.$el, {
          model: this.model,
          params: this.params,
          submittedAnswer: this.submittedAnswer,
          trueAnswer: this.trueAnswer,
          feedback: this.feedback,
        });
        this.rivetsBindingsActive = true;
        var that = this;
        _.each(
          _.uniq(
            _.pluck(
              _.filter(this.rivetsView.bindings, function (binding) {
                return binding.key === 'submittedAnswer' && binding.type === 'checkedoptional';
              }),
              'keypath',
            ),
          ),
          function (kp) {
            if (!that.submittedAnswer.has(kp)) that.submittedAnswer.set(kp, false);
          },
        );
        _.each(
          _.uniq(
            _.pluck(
              _.filter(this.rivetsView.bindings, function (binding) {
                return binding.key === 'submittedAnswer';
              }),
              'keypath',
            ),
          ),
          this.addAnswer.bind(this),
        );
      }
      this.checkSubmittable();
      window.MathJax?.typesetPromise();
      this.trigger('renderFinished');
    },

    close: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      this.remove();
    },

    addAnswer: function (answerName) {
      this.answerAttributes.push({ name: answerName, required: true });
      this.listenTo(this.submittedAnswer, 'change:' + answerName, this.checkSubmittable);
      this.listenTo(this.submittedAnswer, 'change:' + answerName, this.answerChanged);
      this.checkSubmittable();
    },

    addOptionalAnswer: function (answerName) {
      this.answerAttributes.push({ name: answerName, required: false });
      this.listenTo(this.submittedAnswer, 'change:' + answerName, this.answerChanged);
    },

    checkSubmittable: function () {
      var i,
        submittable = true;
      for (i = 0; i < this.answerAttributes.length; i++) {
        if (this.answerAttributes[i].required) {
          if (!this.submittedAnswer.has(this.answerAttributes[i].name)) {
            submittable = false;
            break;
          }
          var answer = this.submittedAnswer.get(this.answerAttributes[i].name);
          if (answer === undefined || answer === null || answer === '') {
            submittable = false;
            break;
          }
        }
      }
      this.model.set('submittable', submittable);
    },

    answerChanged: function () {
      this.model.trigger('answerChanged');
    },

    getSubmittedAnswer: function (_variant) {
      var i,
        answerData = {};
      for (i = 0; i < this.answerAttributes.length; i++) {
        if (this.submittedAnswer.has(this.answerAttributes[i].name)) {
          answerData[this.answerAttributes[i].name] = this.submittedAnswer.get(
            this.answerAttributes[i].name,
          );
        }
      }
      return answerData;
    },
  });

  var AnswerView = Backbone.View.extend({
    initialize: function () {
      this.questionDataModel = this.options.questionDataModel;
      this.appModel = this.options.appModel;
      this.template = this.options.template;
      this.params = this.options.params;
      this.submittedAnswer = this.options.submittedAnswer;
      this.trueAnswer = this.options.trueAnswer;
      this.feedback = this.options.feedback;
      this.rivetsBindingsActive = false;
      this.listenTo(this.submittedAnswer, 'all', this.render);
      this.listenTo(this.trueAnswer, 'all', this.render);
      this.listenTo(this.feedback, 'all', this.render);
      this.render();
    },

    render: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      var templateData = {
        params: this.params.toJSON(),
        submittedAnswer: this.submittedAnswer.toJSON(),
        trueAnswer: this.trueAnswer.toJSON(),
        feedback: this.feedback.toJSON(),
      };
      var templatedHTML = PrairieTemplate.template(
        this.template,
        templateData,
        this.questionDataModel,
        this.appModel,
      );
      if (this.options.templateTwice) {
        templatedHTML = PrairieTemplate.template(
          templatedHTML,
          {},
          this.questionDataModel,
          this.appModel,
        );
      }
      this.$el.html(templatedHTML);
      if (!this.options.skipRivets) {
        this.rivetsView = rivets.bind(this.$el, {
          model: this.model,
          params: this.params,
          submittedAnswer: this.submittedAnswer,
          trueAnswer: this.trueAnswer,
          feedback: this.feedback,
        });
        this.rivetsBindingsActive = true;
      }
      window.MathJax?.typesetPromise();
      this.trigger('renderFinished');
      return this;
    },

    close: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      this.remove();
    },
  });

  var SubmissionView = Backbone.View.extend({
    initialize: function () {
      this.questionDataModel = this.options.questionDataModel;
      this.appModel = this.options.appModel;
      this.template = this.options.template;
      this.params = this.options.params;
      this.submittedAnswer = this.options.submittedAnswer;
      this.feedback = this.options.feedback;
      this.rivetsBindingsActive = false;
      this.render();
    },

    render: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      var templateData = {
        params: this.params.toJSON(),
        submittedAnswer: this.submittedAnswer,
        feedback: this.feedback,
      };
      var templatedHTML = PrairieTemplate.template(
        this.template,
        templateData,
        this.questionDataModel,
        this.appModel,
      );
      if (this.options.templateTwice) {
        templatedHTML = PrairieTemplate.template(
          templatedHTML,
          {},
          this.questionDataModel,
          this.appModel,
        );
      }
      this.$el.html(templatedHTML);
      this.submittedAnswerObject = new Backbone.Model(this.submittedAnswer);
      this.feedbackObject = new Backbone.Model(this.feedback);
      if (!this.options.skipRivets) {
        this.rivetsView = rivets.bind(this.$el, {
          model: this.model,
          params: this.params,
          submittedAnswer: this.submittedAnswerObject,
          feedback: this.feedbackObject,
        });
        //this.rivetsBindingsActive = true;
      }
      window.MathJax?.typesetPromise();
      //this.trigger("renderFinished");
      return this;
    },

    close: function () {
      if (this.rivetsBindingsActive) this.rivetsView.unbind();
      this.remove();
    },
  });

  function SimpleClient(options) {
    this.options = _.defaults(options || {}, {
      questionTemplate: '',
      answerTemplate: '',
      submissionTemplate: 'Not shown for this question.',
      templateTwice: false,
      skipRivets: false,
    });
  }
  _.extend(SimpleClient.prototype, Backbone.Events);

  SimpleClient.prototype.initialize = function (params) {
    this.model = new QuestionModel();
    this.params = new Backbone.Model(params);
    this.submittedAnswer = new Backbone.Model();
    this.trueAnswer = new Backbone.Model();
    this.feedback = new Backbone.Model();
    this.submissionViews = [];
  };

  SimpleClient.prototype.renderQuestion = function (
    questionDivID,
    changeCallback,
    questionDataModel,
    appModel,
  ) {
    var that = this;
    //this.listenTo(this.model, "answerChanged", changeCallback);
    this.questionView = new QuestionView({
      el: questionDivID,
      template: this.options.questionTemplate,
      model: this.model,
      questionDataModel: questionDataModel,
      appModel: appModel,
      params: this.params,
      submittedAnswer: this.submittedAnswer,
      trueAnswer: this.trueAnswer,
      feedback: this.feedback,
      templateTwice: this.options.templateTwice,
      skipRivets: this.options.skipRivets,
    });
    this.listenTo(this.questionView, 'renderFinished', function () {
      that.trigger('renderQuestionFinished');
    });
    this.questionView.render();
  };

  SimpleClient.prototype.renderAnswer = function (answerDivID, questionDataModel, appModel) {
    var that = this;
    this.answerView = new AnswerView({
      el: answerDivID,
      template: this.options.answerTemplate,
      model: this.model,
      questionDataModel: questionDataModel,
      appModel: appModel,
      params: this.params,
      submittedAnswer: this.submittedAnswer,
      trueAnswer: this.trueAnswer,
      feedback: this.feedback,
      templateTwice: this.options.templateTwice,
      skipRivets: this.options.skipRivets,
    });
    this.answerView.render();
    this.listenTo(this.answerView, 'renderFinished', function () {
      that.trigger('renderAnswerFinished');
    });
  };

  SimpleClient.prototype.renderSubmission = function (
    submissionDivID,
    questionDataModel,
    appModel,
    submittedAnswer,
    feedback,
    submissionIndex,
  ) {
    var that = this;
    feedback = feedback || {};
    this.submissionViews[submissionIndex] = new SubmissionView({
      el: submissionDivID,
      template: this.options.submissionTemplate,
      model: this.model,
      questionDataModel: questionDataModel,
      appModel: appModel,
      params: this.params,
      submittedAnswer: submittedAnswer,
      feedback: feedback,
      templateTwice: this.options.templateTwice,
      skipRivets: this.options.skipRivets,
    });
    this.submissionViews[submissionIndex].render();
  };

  SimpleClient.prototype.close = function () {
    this.stopListening();
    if (this.questionView) {
      this.questionView.close();
    }
    if (this.answerView) {
      this.answerView.close();
    }
    if (this.submissionsViews) {
      for (i = 0; i < this.submissionsViews.length; i++) {
        if (this.submissionsViews[i]) {
          this.submissionsViews[i].close();
        }
      }
    }
    this.model = undefined;
    this.params = undefined;
    this.submittedAnswer = undefined;
    this.trueAnswer = undefined;
    this.feedback = undefined;
    this.questionView = undefined;
    this.answerView = undefined;
    this.submissionsViews = undefined;
  };

  SimpleClient.prototype.isComplete = function () {
    if (this.model) return this.model.get('submittable');
    return false;
  };

  SimpleClient.prototype.getSubmittedAnswer = function () {
    if (this.questionView) return this.questionView.getSubmittedAnswer();
    return {};
  };

  SimpleClient.prototype.setSubmittedAnswer = function (submittedAnswer) {
    var that = this;
    _(submittedAnswer).each(function (value, key) {
      that.submittedAnswer.set(key, value);
    });
  };

  SimpleClient.prototype.setTrueAnswer = function (trueAnswer) {
    var that = this;
    _(trueAnswer).each(function (value, key) {
      that.trueAnswer.set(key, value);
    });
    this.model.set('showTrueAnswer', true);
  };

  SimpleClient.prototype.setFeedback = function (feedback) {
    var that = this;
    _(feedback).each(function (value, key) {
      that.feedback.set(key, value);
    });
    this.model.set('showTrueAnswer', true);
  };

  SimpleClient.prototype.addAnswer = function (answer) {
    this.questionView.addAnswer(answer);
  };

  SimpleClient.prototype.addOptionalAnswer = function (answer) {
    this.questionView.addOptionalAnswer(answer);
  };

  return {
    SimpleClient: SimpleClient,
  };
});
