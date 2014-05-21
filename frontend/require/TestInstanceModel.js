
define(['underscore', 'backbone', 'jquery', 'PrairieQueue'], function(_, Backbone, $, PrairieQueue) {

    var TestInstanceModel = Backbone.Model.extend({
        idAttribute: "tiid",

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
            this.set("test", null);
            this.on("change:tid", this.setupTest);
            this.on("reset", this.computeModelData);
            this.on("sync", this.computeModelData);
            this.setupTest();
        },

        setupTest: function() {
            if (this.collection) {
                this.test = this.collection.tests.get(this.get("tid"));
                this.listenTo(this.test, "change", this.computeModelData);
                this.computeModelData();
            }
        },

        computeModelData: function() {
            if (!this.test)
                return;
            if (!this.test.has("helper"))
                return;
            var helper = this.test.get("helper");
            if (!helper.computeModelData)
                return;
            var modelData = helper.computeModelData(this, this.test);
            this.set("modelData", modelData);
        }
    });

    return {
        TestInstanceModel: TestInstanceModel
    };
});
