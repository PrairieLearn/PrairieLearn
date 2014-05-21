
define(['underscore', 'backbone', 'text!HomeView.html'], function(_, Backbone, homeViewTemplate) {

    var HomeView = Backbone.View.extend({

        tagName: 'div',

        initialize: function() {
        },

        render: function() {
            var html = homeViewTemplate;
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        }
    });

    return {
        HomeView: HomeView
    };
});
