
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!AboutView.html'], function(_, Backbone, Mustache, renderer, AboutViewTemplate) {

    var AboutView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
        },

        render: function() {
            var that = this;
            var data = {};
            var html = Mustache.render(AboutViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        AboutView: AboutView
    };
});
