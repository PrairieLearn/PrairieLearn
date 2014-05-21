
define(['underscore', 'backbone'], function(_, Backbone) {

    var StatsModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.requester = options.requester;
            this.appModel = options.appModel;
            this.set({
                "submissionsPerHour": null,
                "usersPerHour": null,
                "usersPerStartHourMidterm1": null,
                "usersPerStartHourMidterm2": null,
                "usersPerSubmissionCount": null,
                "averageQScores": null,
                "uScores": null,
                "trueAvgScores": null
            });
            this.listenTo(this.appModel, "change:userUID", this.loadData);
            this.loadData();
        },

        loadData: function() {
            var that = this;
            var uid = that.appModel.get("userUID");
            if (uid) {
                that.requester.getJSON(that.appModel.apiURL("stats/submissionsPerHour"), function(submissionsPerHour) {
                    that.set("submissionsPerHour", submissionsPerHour);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/usersPerHour"), function(usersPerHour) {
                    that.set("usersPerHour", usersPerHour);
                });
                /*
                that.requester.getJSON(that.appModel.apiURL("stats/usersPerStartHour/Midterm1"), function(usersPerStartHourMidterm1) {
                    that.set("usersPerStartHourMidterm1", usersPerStartHourMidterm1);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/usersPerStartHour/Midterm2"), function(usersPerStartHourMidterm2) {
                    that.set("usersPerStartHourMidterm2", usersPerStartHourMidterm2);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/usersPerSubmissionCount"), function(usersPerSubmissionCount) {
                    that.set("usersPerSubmissionCount", usersPerSubmissionCount);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/averageQScores"), function(averageQScores) {
                    that.set("averageQScores", averageQScores);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/uScores"), function(uScores) {
                    that.set("uScores", uScores);
                });
                that.requester.getJSON(that.appModel.apiURL("stats/trueAvgScores"), function(trueAvgScores) {
                    that.set("trueAvgScores", trueAvgScores);
                });
                */
            }
        }
    });

    return {
        StatsModel: StatsModel
    };
});
