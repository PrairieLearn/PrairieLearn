
define(['underscore', 'backbone', 'mustache', 'text!QuestionSubmitView.html'], function(_, Backbone, Mustache, questionSubmitViewTemplate) {

    var QuestionSubmitView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .submit": "submit",
            "click .submitPractice": "submitPractice",
            "click .submitCorrect": "submitCorrect",
            "click .submitIncorrect": "submitIncorrect",
            "click .save": "save",
            "click .saveAndFlag": "saveAndFlag",
            "click .tryAgain": "tryAgain",
        },

        initialize: function() {
            this.test = this.options.test;
            this.tInstance = this.options.tInstance;
            this.listenTo(this.model, "all", this.render);
        },

        submit: function() {
            this.model.submitAnswer();
        },

        submitPractice: function() {
            this.model.submitAnswer({practice: true});
        },

        submitCorrect: function() {
            this.model.submitAnswer({overrideScore: 1});
        },

        submitIncorrect: function() {
            this.model.submitAnswer({overrideScore: 0});
        },

        save: function() {
            this.model.saveAnswer(false);
        },

        saveAndFlag: function() {
            this.model.saveAnswer(true);
        },

        tryAgain: function() {
            Backbone.trigger("tryAgain");
        },

        render: function() {
            var testOptions = this.test.get("options");
            var data = {
                submittable: this.model.get("submittable"),
                submitted: this.model.get("submitted"),
                overridable: this.model.appModel.hasPermission("overrideScore"),
                saveStatus: '<span class="label label-danger">not saved</span>',
                saveActive: false,
                flagged: this.model.get("flagged"),
                testOpen: true,
            };
            data.allowPractice = testOptions.allowPractice;
            data.allowQuestionSubmit = testOptions.allowQuestionSubmit;
            data.allowQuestionSave = testOptions.allowQuestionSave;
            data.allowTryAgain = (this.model.get("score") != null);
            if (this.tInstance && this.tInstance.has("open"))
                data.testOpen = this.tInstance.get("open");
            if (data.allowQuestionSave) {
                if (this.model.get("saveInProgress")) {
                    data.saveStatus = '<span class="label label-warning">saving...</span>';
                } else if (this.model.get("submitError")) {
                    data.saveStatus = '<span class="label label-danger">save failed</span>';
                } else if (this.model.get("hasSavedSubmission") && this.model.get("dirtyData")) {
                    data.saveStatus = '<span class="label label-danger">change not saved</span>';
                } else if (this.model.get("flagged")) {
                    data.saveStatus = '<span class="label label-warning">saved and flagged for review</span>';
                } else if (!this.model.get("dirtyData")) {
                    data.saveStatus = '<span class="label label-success">saved</span>';
                }
                if (this.model.get("flagged") || this.model.get("dirtyData") && data.submittable)
                    data.saveActive = true;
            }
                
            var html = Mustache.render(questionSubmitViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        QuestionSubmitView: QuestionSubmitView
    };
});
