
define(["underscore", "backbone", "mustache", "text!DefaultTestSidebarView.html"], function(_, Backbone, Mustache, DefaultTestSidebarViewTemplate) {

    var DefaultTestSidebarView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "show.bs.modal": "loadVideo",
            "hide.bs.modal": "unloadVideo"
        },

        initialize: function() {
            this.test = this.options.test;
            this.store = this.options.store;
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.test, "change", this.render);
        },

        loadVideo: function() {
            var $player = $('#player');
            $player.attr('src', $player.data('url'));
        },

        unloadVideo: function() {
            $('#player').attr('src', '');
        },

        render: function() {
            var that = this;

            var data = {};
            data.tid = this.test.get("tid");
            data.qid = this.model.get("qid");
            data.vid = this.model.get("vid");
            data.testShortName = this.store.tidShortName(data.tid);

            data.prevQLink = null;
            data.nextQLink = null;

            data.video = this.model.get("video");

            var html = Mustache.render(DefaultTestSidebarViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=tooltip]').tooltip();
        },

        close: function() {
            this.remove();
        }
    });

    return DefaultTestSidebarView;
});
