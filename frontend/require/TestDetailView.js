
define(['underscore', 'backbone', 'mustache', 'renderer', 'TestFactory', 'text!TestDetailView.html'], function(_, Backbone, Mustache, renderer, TestFactory, TestDetailViewTemplate) {

    var TestDetailView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
            this.appModel = this.options.appModel;
            this.questions = this.options.questions;
            this.listenTo(this.model, "all", this.render);
        },

        render: function() {
            var data = {};
            var html = Mustache.render(TestDetailViewTemplate, data);
            this.$el.html(html);

            var TestDetailView = TestFactory.getClass(this.model.get("type"), "tDetailView");
            if (!TestDetailView)
                return;
            this.subView = new TestDetailView({model: this.model, appModel: this.appModel, test: this.test, questions: this.questions});
            this.listenTo(this.subView, "resetTest", this.resetTest.bind(this));
            this.listenTo(this.subView, "resetTestForAll", this.resetTestForAll.bind(this));
            this.subView.render();
            this.$("#tDetail").html(this.subView.el);
        },

        _resetSuccess: function(data, textStatus, jqXHR) {
        },
        
        _resetError: function(jqXHR, textStatus, errorThrown) {
        },
        
        resetTest: function() {
            var that = this;
            var tid = that.model.get("tid");
            var userUID = that.appModel.get("userUID");
            $.ajax({
                dataType: "json",
                url: that.appModel.apiURL("tInstances?tid=" + tid + "&uid=" + userUID),
                type: "DELETE",
                processData: false,
                contentType: 'application/json; charset=UTF-8',
                success: that._resetSuccess.bind(that),
                error: that._resetError.bind(that),
            });
        },

        resetTestForAll: function() {
            var that = this;
            var tid = that.model.get("tid");
            $.ajax({
                dataType: "json",
                url: that.appModel.apiURL("tInstances?tid=" + tid),
                type: "DELETE",
                processData: false,
                contentType: 'application/json; charset=UTF-8',
                success: that._resetSuccess.bind(that),
                error: that._resetError.bind(that),
            });
        },

        close: function() {
            if (this.subView) {
                this.subView.close();
            }
            this.remove();
        }
    });

    return TestDetailView;
});
