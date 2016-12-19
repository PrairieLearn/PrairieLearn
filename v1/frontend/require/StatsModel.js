
define(['underscore', 'backbone'], function(_, Backbone) {

    var StatsModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
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
                $.getJSON(that.appModel.apiURL("stats/submissionsPerHour"), function(submissionsPerHour) {
                    that.set("submissionsPerHour", submissionsPerHour);
                });
                $.getJSON(that.appModel.apiURL("stats/usersPerHour"), function(usersPerHour) {
                    that.set("usersPerHour", usersPerHour);
                });
            }
        }
    });

    return {
        StatsModel: StatsModel
    };
});
