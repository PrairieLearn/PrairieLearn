
define(['underscore', 'backbone', 'jquery', 'PrairieQueue'], function(_, Backbone, $, PrairieQueue) {

    var TestModel = Backbone.Model.extend({
        idAttribute: "tid",

        initialize: function(attributes, options) {
            var clientURL = this.url() + "/client.js";
            var that = this;
            require([clientURL], function(client) {
                that.set("client", client);
                if (client.TestHelper)
                    that.set("helper", new client.TestHelper());
            });
            $.ajax({
                dataType: "html",
                url: this.url() + "/test.html",
                success: function(template) {
                    that.set("template", template);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('ajax error');
                }
            });
            $.ajax({
                dataType: "html",
                url: this.url() + "/testOverview.html",
                success: function(template) {
                    that.set("templateOverview", template);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('ajax error');
                }
            });
            $.ajax({
                dataType: "html",
                url: this.url() + "/testSidebar.html",
                success: function(template) {
                    that.set("templateSidebar", template);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('ajax error');
                }
            });
        },

        /** Call task(<TestModel>) once the TestModel has a TestHelper set.
         */
        callWithHelper: function(task) {
            if (this.has("helper"))
                return task(this);
            if (this.helperTasks === undefined) {
                this.helperTasks = [];
                this.on("change:helper", this._processHelperTasks.bind(this));
            }
            this.helperTasks.push(task);
        },

        /** Internal helper, do not call.
         */
        _processHelperTasks: function() {
            if (!this.has("helper"))
                return;
            if (this.helperTasks === undefined)
                return;
            var that = this;
            _(this.helperTasks).each(function(task) {
                task(that);
            });
        }
    });

    return {
        TestModel: TestModel
    };
});
