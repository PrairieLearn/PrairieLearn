
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
                var templateHTML = Mustache.render(questionSubmissionsViewTemplate, templateData);
                this.$el.html(templateHTML);
                
                // For each submission, render template into div id='#<sid>submissionBody'
                pastSubmissions.each( function(submission, index, pastSubmissions) {
                    var sid = submission.get("sid");
                    var divID = "#"+sid+"submissionBody";
                    
                    var submissionTemplateData = submission.toJSON();
                    // Draw newest submission first, but call oldest submisssion "Submission 1";
                    submissionTemplateData.index = pastSubmissions.length-index;
                    // Fix the datestamp to look nicer
                    prettyDate = moment(submissionTemplateData.date).format('lll');
                    submissionTemplateData.date = prettyDate;
                    // Generate a status label
                    if (submissionTemplateData.graded) {
                        /* Right now, submissions always come back with graded = false, since we
                            aren't updating the graded flag in the database (and we're not sending
                            the score attribute during the GET call)
                           If we update the way we store grading information, then we can use the score
                            attribute to pick a correct/incorrect flag here.
                        
                        if (submissionTemplateData.correct == 1) {
                            submissionTemplateData.submissionStatus = '<span class="label label-success">correct</span>';
                        }
                        else {
                            submissionTemplateData.submissionStatus = '<span class="label label-danger">incorrect</span>';
                        } */
                    } else {
                        submissionTemplateData.submissionStatus = '<span class="label label-primary">saved</span>';
                    }
                    
                    var submissionHTML = Mustache.render(submissionTemplate, submissionTemplateData);
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
