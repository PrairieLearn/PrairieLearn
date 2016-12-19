
define(['underscore', 'backbone', 'jquery', 'async'], function(_, Backbone, $, async) {

    var SyncModel = Backbone.Model.extend({
        initialize: function(attributes, options) {
            this.pullError = null;
            this.pullInProgress = false;
        },
    });

    return {
        SyncModel: SyncModel
    };
});
