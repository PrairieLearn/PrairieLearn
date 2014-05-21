
define(['underscore', 'backbone', 'mustache', 'text!QuestionSubmitView.html'], function(_, Backbone, Mustache, questionSubmitViewTemplate) {

    var QuestionSubmitView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .submit": "submit",
            "click .submitPractice": "submitPractice",
            "click .submitCorrect": "submitCorrect",
            "click .submitIncorrect": "submitIncorrect",
            "click .save": "save",
        },

        initialize: function() {
            //this.listenTo(this.model, "change:submittable change:submitted", this.render);
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
            this.model.saveAnswer();
        },

        render: function() {
            var data = {
                submittable: this.model.get("submittable"),
                submitted: this.model.get("submitted"),
                overridable: this.model.appModel.hasPermission("overrideScore"),
                allowSubmit: true,
                allowSave: false,
                saveStatus: '<span class="label label-danger">not saved</span>',
                saveActive: false,
                testOpen: true,
            };
            data.allowPractice = this.model.get("allowPractice");
            data.allowSubmit = this.model.get("allowSubmit");
            data.allowSave = this.model.get("allowSave");
            if (this.tInstance && this.tInstance.has("open"))
                data.testOpen = this.tInstance.get("open");
            if (data.allowSave) {
                if (this.model.get("saveInProgress")) {
                    data.saveStatus = '<span class="label label-warning">saving...</span>';
                } else if (this.model.get("submitError")) {
                    data.saveStatus = '<span class="label label-danger">save failed</span>';
                } else if (this.model.get("hasSavedSubmission") && this.model.get("dirtyData")) {
                    data.saveStatus = '<span class="label label-danger">change not saved</span>';
                } else if (!this.model.get("dirtyData")) {
                    data.saveStatus = '<span class="label label-success">saved</span>';
                }
                if (this.model.get("dirtyData") && data.submittable)
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
