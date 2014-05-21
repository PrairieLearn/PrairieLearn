
define(['underscore', 'backbone'], function(_, Backbone) {

    var ActivityModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.requester = options.requester;
            this.appModel = options.appModel;
            this.set("submissions", []);
            this.listenTo(this.appModel, "change:userUID", this.loadSubmissions);
            this.loadSubmissions();
        },

        loadSubmissions: function() {
            var that = this;
            var uid = that.appModel.get("userUID");
            if (uid) {
                that.requester.getJSON(that.appModel.apiURL("submissions?uid=" + uid), function(submissions) {
                    that.set("submissions", submissions);
                });
            }
        }
    });

    return {
        ActivityModel: ActivityModel
    };
});
