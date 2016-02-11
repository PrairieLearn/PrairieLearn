
define(['underscore', 'backbone', 'mustache', 'renderer', 'text!SyncView.html'], function(_, Backbone, Mustache, renderer, SyncViewTemplate) {

    var SyncView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click #pullFromGitHub": "pull",
        },

        initialize: function() {
            this.syncModel = this.options.syncModel;
            this.pulls = this.options.pulls;
            this.listenTo(this.pulls, "add", this.render);
            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.syncModel, "change", this.render);
        },

        render: function() {
            var that = this;
            var data = {};
            var version = this.model.get("version");
            data.hasVersion = false;
            if (version && version.gitDescribe) {
                var match = /^(.+)-([0-9]+)-g([0-9a-z]+)$/.exec(version.gitDescribe);
                if (match) {
                    var tag = match[1];
                    var commitsAhead = match[2];
                    var sha1 = match[3];
                    if (commitsAhead == 0) {
                        data.hasVersion = true;
                        data.exactVersion = tag;
                        data.sha1 = sha1;
                    } else {
                        data.hasVersion = true;
                        data.lastVersion = tag;
                        data.commitsAhead = commitsAhead;
                        data.commitsAheadString = commitsAhead + " " + ((commitsAhead == 1) ? "commit" : "commits");
                        data.sha1 = sha1;
                    }
                }
            }
            data.seePulls = this.model.get("gitCourseBranch");
            data.pullError = this.syncModel.get("pullError");
            data.editCoursePulls = this.model.hasPermission("editCoursePulls");
            data.gitCourseBranch = this.model.get('gitCourseBranch');
            data.remoteFetchURL = this.model.get('remoteFetchURL');
            data.pullsList = this.pulls.toJSON();
            _(data.pullsList).each(function(pull) {
                pull.panelType = "default";
                pull.inProgress = false;
            });
            if (this.syncModel.get("pullInProgress")) {
                data.pullsList.splice(0, 0, {inProgress: true});
            }
            if (data.pullsList.length > 0) {
                data.pullsList[0].classIn = "in";
                data.pullsList[0].panelType = "primary";
                data.pullsList[0].extraTitle = "(current)";
            }
            var html = Mustache.render(SyncViewTemplate, data);
            this.$el.html(html);
        },

        close: function() {
            this.remove();
        },

        pull: function(event) {
            this.syncModel.set("pullError", null);
            this.syncModel.set("pullInProgress", true);
            var that = this;
            var successFn = function(submission) {
                that.syncModel.set("pullInProgress", false);
                that.pulls.fetch({
                    error: function() {that.syncModel.set("pullError", "Error retrieving pull results");},
                });
                Backbone.trigger("reloadUserData");
            };
            var errorFn = function(jqXHR, textStatus, errorThrown) {
                this.syncModel.set("pullInProgress", false);
                var e = textStatus ? textStatus : "Unknown error";
                if (e === "error" && errorThrown)
                    e = errorThrown;
                that.syncModel.set("pullError", e);
            };
            $.ajax({
                dataType: "json",
                url: that.model.apiURL("coursePulls"),
                type: "POST",
                processData: false,
                data: JSON.stringify({}),
                contentType: 'application/json; charset=UTF-8',
                timeout: 20000,
                success: successFn,
                error: errorFn,
            });
        },
    });

    return {
        SyncView: SyncView
    };
});
