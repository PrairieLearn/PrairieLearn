
define(["jquery", "underscore", "backbone", "rivets", "PrairieTemplate"], function($, _, Backbone, rivets, PrairieTemplate) {

    rivets.configure({
        templateDelimiters: ['{{', '}}'],
        adapter: {
            subscribe: function(obj, keypath, callback) {
                obj.on('change:' + keypath, callback);
            },
            unsubscribe: function(obj, keypath, callback) {
                obj.off('change:' + keypath, callback);
            },
            read: function(obj, keypath) {
                return obj.get(keypath);
            },
            publish: function(obj, keypath, value) {
                obj.set(keypath, value);
            }
        }
    });

    rivets.binders.instavalue = {
        publishes: true,
        bind: function(el) {
            return rivets._.Util.bindEvent(el, 'input', this.publish);
        },
        unbind: function(el) {
            return rivets._.Util.unbindEvent(el, 'input', this.publish);
        },
        routine: function(el, value) {
            var _ref;
            
            el = $(el);
            if ((value != null ? value.toString() : void 0) !== ((_ref = el.val()) != null ? _ref.toString() : void 0)) {
                return el.val(value != null ? value : '');
            }
        }
    };

    rivets.binders.checkedoptional = {
        publishes: true,
        bind: function(el) {
            return rivets._.Util.bindEvent(el, 'change', this.publish);
        },
        unbind: function(el) {
            return rivets._.Util.unbindEvent(el, 'change', this.publish);
        },
        routine: function(el, value) {
            el.checked = !!value;
            return el.checked;
        }
    };

    rivets.formatters.floatFixed = PrairieTemplate.floatFixedString;
    rivets.formatters.rational = PrairieTemplate.rationalString;
    rivets.formatters.rationalCoeff = PrairieTemplate.rationalCoeffString;
    rivets.formatters.rationalCoeffZero = PrairieTemplate.rationalCoeffZeroString;
    rivets.formatters.vector = PrairieTemplate.vectorString;
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
        return (dir > 0) ? "counterclockwise" : "clockwise";
    };
    rivets.formatters.directionNameRL = function (dir) {
        return (dir > 0) ? "right" : "left";
    };
    rivets.formatters.directionNameUD = function (dir) {
        return (dir > 0) ? "up" : "down";
    };
    rivets.formatters.directionNameIncDec = function (dir) {
        return (dir > 0) ? "increasing" : "decreasing";
    };

    var QuestionModel = Backbone.Model.extend({
        initialize: function() {
            this.set({
                submittable: false,
                showTrueAnswer: false
            });
        }
    });

    var QuestionView = Backbone.View.extend({

        initialize: function() {
            this.answerAttributes = this.answerAttributes || [];
            this.params = this.options.params;
            this.submittedAnswer = this.options.submittedAnswer;
            this.trueAnswer = this.options.trueAnswer;
            var templateData = {
                params: this.params.toJSON(),
                submittedAnswer: this.submittedAnswer.toJSON(),
                trueAnswer: this.trueAnswer.toJSON()
            };
            this.$el.html(PrairieTemplate.template(this.options.qHtml, templateData));
            this.rivetsView = rivets.bind(this.$el, {
                model: this.model,
                params: this.params,
                submittedAnswer: this.submittedAnswer,
                trueAnswer: this.trueAnswer
            });
            var that = this;
            _.each(_.uniq(_.pluck(_.filter(this.rivetsView.bindings,
                                           function (binding) {return binding.key === "submittedAnswer" && binding.type === "checkedoptional";}),
                                  "keypath")),
                   function (kp) {that.submittedAnswer.set(kp, false);});
            _.each(_.uniq(_.pluck(_.filter(this.rivetsView.bindings,
                                           function (binding) {return binding.key === "submittedAnswer";}),
                                  "keypath")),
                   this.addAnswer.bind(this));
            this.checkSubmittable();
            if (window.MathJax)
                MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
        },

        render: function() {
            return this;
        },

        close: function() {
            this.rivetsView.unbind();
            this.remove();
        },

        addAnswer: function(answerName) {
            this.answerAttributes.push(answerName);
            this.listenTo(this.submittedAnswer, "change:" + answerName, this.checkSubmittable);
            this.listenTo(this.submittedAnswer, "change:" + answerName, this.answerChanged);
            this.checkSubmittable();
        },

        checkSubmittable: function() {
            var i, submittable = true;
            for (i = 0; i < this.answerAttributes.length; i++) {
                if (!this.submittedAnswer.has(this.answerAttributes[i])) {
                    submittable = false;
                    break;
                }
                var answer = this.submittedAnswer.get(this.answerAttributes[i]);
                if (answer === undefined || answer === null || answer === "") {
                    submittable = false;
                    break;
                }
            }
            this.model.set("submittable", submittable);
        },

        answerChanged: function() {
            this.model.trigger("answerChanged");
        },

        getSubmittedAnswer: function() {
            var i, answerData = {};
            for (i = 0; i < this.answerAttributes.length; i++) {
                answerData[this.answerAttributes[i]] = this.submittedAnswer.get(this.answerAttributes[i]);
            }
            return answerData;
        },
    });

    function SimpleClient() {
    }
    _.extend(SimpleClient.prototype, Backbone.Events);

    SimpleClient.prototype.render = function(divID, params, qHtml, canSubmit, answerChanged) {
        var that = this;

        this.model = new QuestionModel();
        this.listenTo(this.model, "change:submittable", function() {
            canSubmit(that.model.get("submittable"));
        });
        this.listenTo(this.model, "answerChanged", function() {
            answerChanged();
        });
        this.params = new Backbone.Model(params);
        this.submittedAnswer = new Backbone.Model();
        this.trueAnswer = new Backbone.Model();
        this.questionView = new QuestionView({el: divID, model: this.model, qHtml: qHtml, params: this.params, submittedAnswer: this.submittedAnswer, trueAnswer: this.trueAnswer});
        this.questionView.render();
        this.trigger("renderFinished");
    };

    SimpleClient.prototype.close = function() {
        this.stopListening();
        if (this.questionView) {
            this.questionView.close();
        }
        this.model = undefined;
        this.params = undefined;
        this.submittedAnswer = undefined;
        this.trueAnswer = undefined;
        this.questionView = undefined;
    };

    SimpleClient.prototype.getSubmittedAnswer = function() {
        return this.questionView.getSubmittedAnswer();
    };

    SimpleClient.prototype.setSubmittedAnswer = function(submittedAnswer) {
        var that = this;
        _(submittedAnswer).each(function(value, key) {
            that.submittedAnswer.set(key, value);
        });
    };

    SimpleClient.prototype.showSolution = function(trueAnswer) {
        var that = this;
        _(trueAnswer).each(function(value, key) {
            that.trueAnswer.set(key, value);
        });
        this.model.set("showTrueAnswer", true);
    };

    SimpleClient.prototype.addAnswer = function(answer) {
        this.questionView.addAnswer(answer);
    };

    return {
        SimpleClient: SimpleClient
    };
});
