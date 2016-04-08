
define(['underscore', 'backbone', 'mustache', 'moment', 'renderer', 'spinController', 'text!QuestionSubmissionsView.html'], function(_, Backbone, Mustache, moment, renderer, spinController, questionSubmissionsViewTemplate) {

    var QuestionSubmissionsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change:qClient change:pastSubmissions change:showSubmissions refreshSubmissionsView", this.render);
            this.render();
        },

        render: function() {
            that = this;
            var showSubmissions = this.model.get("showSubmissions");
            var pastSubmissions = this.model.get("pastSubmissions");
            var qClient = this.model.get("qClient");
            if (qClient && pastSubmissions && showSubmissions) {
                var submissionTemplate = qClient.getSubmissionTemplate();
                var templateData = {
                    showSubmissions: showSubmissions,
                    pastSubmissions: pastSubmissions.toJSON(),
                }
                
                // Insert the meta-data for each submission to draw the corresponding panel
                _.each(templateData.pastSubmissions, function(submission, index, pastSubmissions) {
                    submission.prettyDate = moment(submission.date).format('lll');
                    submission.submissionIndex = pastSubmissions.length - index;
                    // Determine the submission status and corresponding panel style
                    if (submission.graded) {
                        /* Right now, submissions always have graded = false, since we never update
                            the graded flag in the database (and we don't send the score attribude 
                            during a GET call)
                           If we update the way we store grading information, then we can use the
                            score here to pick a correct/incorrect flag.
                        if (submission.correct == 1) {
                            submission.submissionPanelStyle = 'panel-success';
                            submission.submissionStatus = '<span class="label label-success">correct</div>';
                        } else {
                            submission.submissionPanelStyle = 'panel-danger';
                            submission.submissionStatus = '<span class="label label-danger">incorrect</div>';
                        } */
                    } else {
                        submission.submissionPanelStyle = 'panel-info';
                        submission.submissionStatus = '<span class="label label-primary">saved</span>';
                    }
                });
                
                var templateHTML = Mustache.render(questionSubmissionsViewTemplate, templateData);
                this.$el.html(templateHTML);
                
                // For each submission, render template into div id='#<sid>submissionBody'
                pastSubmissions.each( function(submission, index, pastSubmissions) {
                    var sid = submission.get("sid");
                    var divID = "#"+sid+"submissionBody";
                    
                    var submissionHTML = Mustache.render(submissionTemplate, submission.toJSON());
                    that.$(divID).html(submissionHTML);
                });
                if (window.MathJax)
                MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
            }
        },

        close: function() {
            this.remove();
        },
    });

    return {
        QuestionSubmissionsView: QuestionSubmissionsView
    };
});
