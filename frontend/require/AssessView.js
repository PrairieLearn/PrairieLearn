
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
            data.seeDetail = "yes";
            data.assessList = [
                {
                    detail: '<a href="" class="btn btn-info btn-xs">Admin</a>',
                    title: '<a href="ti/ti234">Homework 1: Vectors and coordinates</a>',
                    score: '<div class="progress"><div class="progress-bar progress-bar-success" style="width: 68%">68%</div><div class="progress-bar progress-bar-danger" style="width: 32%"></div></div>',
                    dueDate: 'Wed, Sep 2, 23:59',
                },
                {
                    detail: '<a href="" class="btn btn-info btn-xs">Admin</a>',
                    title: '<a href="ti/ti234">Homework 2: Tangential-normal basis</a>',
                    score: '<div class="progress"><div class="progress-bar progress-bar-success" style="width: 12%"></div><div class="progress-bar progress-bar-danger" style="width: 88%">12%</div></div>',
                    dueDate: 'Fri, Sep 10, 23:59',
                },
                {
                    detail: '<a href="" class="btn btn-info btn-xs">Admin</a>',
                    rowSpec: 'class="warning"',
                    title: '<a href="ti/ti234">Homework 3: Rigid body kinetics and kinematics</a>',
                    score: '<div class="progress"><div class="progress-bar progress-bar-success" style="width: 100%">100%</div><div class="progress-bar progress-bar-danger" style="width: 0%"></div></div>',
                    dueDate: 'Mon, Oct 28, 23:59',
                },
                {
                    detail: '<a href="" class="btn btn-info btn-xs">Admin</a>',
                    title: 'Practice Quiz 1: Tangential-normal basis <a href="ti/ti234" class="btn btn-info btn-xs" data-toggle="modal" data-target="#confirmGenerateVersionModal">Generate new version</a>',
                },
                {
                    detail: '<a href="" class="btn btn-info btn-xs">Admin</a>',
                    title: '<a href="ti/ti234">Practice Quiz 1: Tangential-normal basis (version 1)</a>',
                    score: '<div class="progress"><div class="progress-bar progress-bar-success" style="width: 49%"></div><div class="progress-bar progress-bar-danger" style="width: 51%">49%</div></div>',
                    dueDate: '',
                },
            ];
            var html = Mustache.render(AssessViewTemplate, data);
            this.$el.html(html);

            this.subViews = [];
            this.tests.each(function(test) {
                var tid = test.get("tid");
                var TestView = TestFactory.getClass(test.get("type"), "testView");
                if (!TestView)
                    return;
                var subView = new TestView({model: test, appModel: that.appModel, tInstances: that.tInstances});
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
