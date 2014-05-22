
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!ExamsView.html'], function(_, Backbone, Mustache, renderer, ExamsViewTemplate) {

    var ExamsView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.router = this.options.router;
            this.tests = this.options.tests;
            this.tInstances = this.options.tInstances;
            this.listenTo(this.tInstances, "all", this.render);
            this.listenTo(this.tests, "all", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.testList = [];
            this.tests.each(function(test) {
                data.testList.push({
                    tid: test.get("tid")
                });
            });
            var html = Mustache.render(ExamsViewTemplate, data);
            this.$el.html(html);

            this.subViews = [];
            this.tests.each(function(test) {
                if (!test.has("client"))
                    return;
                var client = test.get("client");
                var tid = test.get("tid");
                var subView = new client.TestView({model: test, tInstances: that.tInstances});
                var options = {
                    wait: true,
                    success: function(model, resp, options) {
                        var tiid = model.get("tiid");
                        that.router.navigate("ti/" + tiid, {trigger: true});
                    },
                };
                that.listenTo(subView, "createTestInstance", that.tInstances.create.bind(that.tInstances, {uid: that.appModel.get("userUID"), tid: tid}, options));
                that.subViews.push(subView);
                subView.render();
                that.$("#" + tid).html(subView.el);
            });
        },

        close: function() {
            if (this.subViews) {
                _(this.subViews).each(function(subView) {
                    subView.close();
                });
            }
            this.remove();
        }
    });

    return ExamsView;
});
