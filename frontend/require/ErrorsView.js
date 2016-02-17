
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!ErrorsView.html'], function(_, Backbone, Mustache, renderer, ErrorsViewTemplate) {

    var ErrorsView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click #reloadErrors": "reloadErrors",
        },

        initialize: function() {
            this.appModel = this.options.appModel;
            this.store = this.options.store;
            this.errorList = this.store.errorList;
            this.listenTo(this.errorList, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            data.errorList = [];
            var errorList = this.errorList.get("errorList");
            colormap = {
                'info': 'success',
                'warn': 'warning',
                'error': 'danger',
            };
            if (_(errorList).isArray()) {
                _(errorList).each(function(error) {
                    data.errorList.push({
                        color: colormap[error.level] || '',
                        date: that.appModel.formatDateLong(error.timestamp),
                        level: error.level,
                        msg: error.msg,
                        data: JSON.stringify(error.meta),
                    });
                });
            }
            var html = Mustache.render(ErrorsViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },

        reloadSuccess: function(model, response, options) {
            this.$("#reloadResults").append('<div class="alert alert-success alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>Error list successfully reloaded</div>');
        },

        reloadError: function(model, response, options) {
            this.$("#reloadResults").append('<div class="alert alert-danger alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>Error reloading error list</div>');
        },

        reloadErrors: function(event) {
            this.errorList.clear(); // deliberately clear to trigger re-rendering flash on screen
            this.errorList.fetch({
                //success: this.reloadSuccess.bind(this), // disable explicit success indicator
                error: this.reloadError.bind(this),
            });
        },
    });

    return {
        ErrorsView: ErrorsView
    };
});
