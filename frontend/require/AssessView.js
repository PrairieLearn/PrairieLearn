
define(['underscore', 'backbone', 'mustache', 'renderer', 'TestFactory', 'text!AssessView.html'], function(_, Backbone, Mustache, renderer, TestFactory, AssessViewTemplate) {

    var AssessView = Backbone.View.extend({

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
            var html = Mustache.render(AssessViewTemplate, data);
            this.$el.html(html);

            this.subViews = [];
            this.tests.each(function(test) {
                var tid = test.get("tid");
                var TestView = TestFactory.getClass(test.get("type"), "testView");
                if (!TestView)
                    return;
                var subView = new TestView({model: test, tInstances: that.tInstances});
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

    return AssessView;
});
