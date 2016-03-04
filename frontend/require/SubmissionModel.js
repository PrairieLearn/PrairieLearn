
define(['underscore', 'backbone', 'jquery', 'PrairieQueue'], function(_, Backbone, $, PrairieQueue) {

    var SubmissionModel = Backbone.Model.extend({
        idAttribute: "sid",

        url: function() {
            var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || Backbone.urlError();
            if (this.isNew()) return base;
            // strip query parameters from base URL before adding instance-specific ID
            var optIndex = base.indexOf('?');
            if (optIndex >= 0)
                base = base.slice(0, optIndex);
            return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
        },

        initialize: function(attributes, options) {

        },
    });

    return {
        SubmissionModel: SubmissionModel
    };
});
