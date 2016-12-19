
define(['underscore', 'backbone', 'TestInstanceModel'], function(_, Backbone, TestInstanceModel) {

    var TestInstanceCollection = Backbone.Collection.extend({
        model: TestInstanceModel.TestInstanceModel,

        initialize: function(models, options) {
            this.tests = options.tests;
        },

        comparator: function(testInstance) {
            return -testInstance.get("number"); // sort by negative number, so larger numbers first
        },
    });

    return {
        TestInstanceCollection: TestInstanceCollection
    };
});
