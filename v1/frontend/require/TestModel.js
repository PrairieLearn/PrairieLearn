
define(['underscore', 'backbone'], function(_, Backbone) {

    var TestModel = Backbone.Model.extend({
        idAttribute: "tid",
    });

    return {
        TestModel: TestModel
    };
});
