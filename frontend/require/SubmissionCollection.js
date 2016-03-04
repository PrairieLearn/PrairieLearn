
define(['underscore', 'backbone', 'SubmissionModel', 'moment'], function(_, Backbone, SubmissionModel, moment) {

    var SubmissionCollection = Backbone.Collection.extend({
        model: SubmissionModel.SubmissionModel,

        initialize: function(models, options) {
            this.qiid = options.qiid;
        },

        comparator: function(thisSub, thatSub) {
            // compare by timestamp; latest submission first
			difference = moment(thisSub.get("date")).diff(moment(thatSub.get("date")));
			if (difference < 0)
				return 1;
			else if (difference > 0)
				return -1;
			else
				return 0;
        },
    });

    return {
        SubmissionCollection: SubmissionCollection
    };
});
