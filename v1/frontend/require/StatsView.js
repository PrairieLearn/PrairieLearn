
define(['underscore', 'backbone', 'mustache', 'renderer', 'dygraph-combined', 'text!StatsView.html', 'd3', 'PrairieGeom', 'PrairieStats'], function(_, Backbone, Mustache, renderer, Dygraph, statsViewTemplate, d3, PrairieGeom, PrairieStats) {

    var StatsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.listenTo(this.model, "change", this.render);
        },

        render: function() {
            if (this.submissionsPerHour)
                this.submissionsPerHour.destroy();
            if (this.usersPerHour)
                this.usersPerHour.destroy();

            var submissionsPerHour = this.model.get("submissionsPerHour");
            var usersPerHour = this.model.get("usersPerHour");

            var renderData = {};
            if (submissionsPerHour)
                renderData.submissionsPerHourGenDate = new Date(submissionsPerHour.date).toString();
            if (usersPerHour)
                renderData.usersPerHourGenDate = new Date(usersPerHour.date).toString();

            var html = Mustache.render(statsViewTemplate, renderData);
            this.$el.html(html);

            if (submissionsPerHour) {
                var data = [], i;
                for (i = 0; i < submissionsPerHour.times.length; i++) {
                    data.push([new Date(submissionsPerHour.times[i]), submissionsPerHour.submissions[i]]);
                }
                var el = this.$("#submissionsPerHour").get(0);
                this.submissionsPerHour = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Answer submissions per hour",
                    xlabel: "date",
                    ylabel: "submissions / h",
                    showRangeSelector: true,
                    labels: ["date", "submissions"],
                });
            }

            if (usersPerHour) {
                var data = [], i;
                for (i = 0; i < usersPerHour.times.length; i++) {
                    data.push([new Date(usersPerHour.times[i]), usersPerHour.users[i]]);
                }
                var el = this.$("#usersPerHour").get(0);
                this.usersPerHour = new Dygraph.Dygraph(el, data, {
                    includeZero: true,
                    title: "Unique students per hour",
                    xlabel: "date",
                    ylabel: "students / h",
                    showRangeSelector: true,
                    labels: ["date", "students"]
                });
            }
        },

        close: function() {
            if (this.submissionsPerHour)
                this.submissionsPerHour.destroy();
            if (this.usersPerHour)
                this.usersPerHour.destroy();
            this.remove();
        }
    });

    return {
        StatsView: StatsView
    };
});
