
define(['underscore', 'backbone', 'mustache', 'moment-timezone', 'naturalSort', 'renderer', 'TestFactory', 'text!AssessView.html'], function(_, Backbone, Mustache, moment, naturalSort, renderer, TestFactory, AssessViewTemplate) {

    var AssessView = Backbone.View.extend({

        tagName: 'div',

        events: {
            "click .generateVersion": "generateVersion",
        },

        initialize: function() {
            this.store = this.options.store;
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
            data.setList = [];
            data.confirmGenerateVersionList = [];
            var sets = _(this.tests.pluck("set")).uniq().sort();
            _(sets).each(function(set) {
                var setData = {
                    title: set,
                    assessList: [],
                };
                var theseTests = that.tests.where({set: set});
                theseTests.sort(function(t1, t2) {var n1 = t1.get("number"), n2 = t2.get("number"); return naturalSort(n1, n2);});
                theseTests = new Backbone.Collection(theseTests);
                theseTests.each(function(test) {
                    var tid = test.get("tid");
                    var testTitle = that.store.tidLongName(tid);
                    var options = test.get("options");
                    var testAdmin = null;
                    if (that.appModel.hasPermission("seeAdminPages")) {
                        testAdmin = '<a href="#t/' + tid + '" class="btn btn-info btn-xs">Admin</a>';
                    }
                    if (test.get("multipleInstance")) {
                        var assess = {
                            title: testTitle,
                            extra: '<button class="btn btn-primary btn-xs" data-toggle="modal" data-target="#confirmGenerateVersionModal-' + tid + '">New version</button>',
                            admin: testAdmin,
                        };
                        setData.assessList.push(assess);

                        var confirmGenerateVersion = {
                            tid: tid,
                            title: testTitle,
                        };
                        data.confirmGenerateVersionList.push(confirmGenerateVersion);
                    }
                    
                    var theseTInstances = new Backbone.Collection(that.tInstances.where({tid: tid}));
                    theseTInstances = new Backbone.Collection(theseTInstances.sortBy("number"));
                    theseTInstances.each(function(tInstance) {
                        var tiid = tInstance.get("tiid");
                        var tiNumber = tInstance.get("number");
                        var title = that.store.tiidLongName(tiid);
                        var shortTitle = that.store.tiidShortName(tiid);
                        var admin = testAdmin;
                        if (test.get("multipleInstance")) {
                            admin = null;
                        }
                        var scorePerc = tInstance.get("scorePerc");
                        var score = Math.min(100, scorePerc);
                        var remScore = 100 - score;
                        var scoreHTML;
                        if (tInstance.has("open") && tInstance.get("open")) {
                            scoreHTML = null;
                        } else if (score >= 50) {
                            scoreHTML = '<div class="progress" style="min-width: 5em">'
                                + '<div class="progress-bar progress-bar-success" style="width: ' + score + '%">' + scorePerc + '%</div>'
                                + '<div class="progress-bar progress-bar-danger" style="width: ' + remScore + '%"></div>'
                                + '</div>';
                        } else {
                            scoreHTML = '<div class="progress" style="min-width: 5em">'
                                + '<div class="progress-bar progress-bar-success" style="width: ' + scorePerc + '%"></div>'
                                + '<div class="progress-bar progress-bar-danger" style="width: ' + remScore + '%">' + score + '%</div>'
                                + '</div>';
                        }
                        var date = null;
                        var dateTooltip = null;
                        var highlightRow = false;
                        if (tInstance.has("open") && tInstance.get("open")) {
                            date = "in progress";
                            highlightRow = true;
                        } else if (test.has("type") && (test.get("type") == "Basic" || (test.get("type") == "Game"))) {
                            var nextEndDate = test.get("nextEndDate");
                            if (nextEndDate) date = that.appModel.formatDate(nextEndDate);
                            var credit = test.get("credit");
                            var tooltip = "Due date: " + that.appModel.formatDateLong(nextEndDate);
                            if (credit > 100) {
                                tooltip += ' (bonus ' + (credit - 100) + '%)';
                            } else if (credit == 100) {
                                tooltip += ' (full credit)';
                            } else {
                                tooltip += ' (' + credit + '% credit';
                            }

                            /*
                            var tooltip = "<table><tr><th>Credit</th><th>Start</th><th>End</th></tr>";
                            _(test.get("periods")).each(function(p) {
                                tooltip += '<tr>';
                                if (credit > 100) {
                                    tooltip += '<td>bonus ' + (credit - 100) + '%</td>';
                                } else if (credit == 100) {
                                    tooltip += '<td>full credit</td>';
                                } else {
                                    tooltip += '<td>' + credit + '% credit</td>';
                                }
                                tooltip += '</tr>';
                            });
                            tooltip += '</table>';
                            */
                            
                            dateTooltip = tooltip;
                            if (nextEndDate && moment(test.get(nextEndDate)).isAfter(moment())) {
                                highlightRow = true;
                            }
                        } else if (tInstance.has("finishDate")) {
                            date = that.appModel.formatDate(tInstance.get("finishDate"));
                            dateTooltip = "Completed date: " + that.appModel.formatDateLong(tInstance.get("finishDate"));
                        }
                        var assess = {
                            rowSpec: highlightRow ? 'class="warning"' : '',
                            admin: admin,
                            title: '<a href="#ti/' + tid + '/' + tiNumber + '">' + title + '</a>',
                            shortTitle: shortTitle,
                            score: scoreHTML,
                            date: date,
                            dateTooltip: dateTooltip,
                        };
                        setData.assessList.push(assess);
                    });
                });
                data.setList.push(setData);
            });

            var html = Mustache.render(AssessViewTemplate, data);
            this.$el.html(html);
            this.$('[data-toggle=popover]').popover();
        },

        generateVersion: function(event) {
            var tid = event.target.id.slice(16); // strip off leading "generateVersion-"
            var that = this;
            this.$('#confirmGenerateVersionModal-' + tid).on('hidden.bs.modal', function (e) {
                var tInstance = {
                    uid: that.appModel.get("userUID"),
                    tid: tid,
                };
                var options = {
                    wait: true,
                };
                that.tInstances.create(tInstance, options);
            })
            this.$("#confirmGenerateVersionModal-" + tid).modal('hide');
        },
            
        close: function() {
            this.remove();
        }
    });

    return AssessView;
});
