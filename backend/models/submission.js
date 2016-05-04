module.exports = function(sequelize, DataTypes) {
    var Submission = sequelize.define("Submission", {
        sid: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        questionInstanceId: {type: DataTypes.INTEGER, field: 'question_instance_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
        submittedAnswer: {type: DataTypes.JSONB, field: 'submitted_answer'},
        type: DataTypes.ENUM('check', 'score', 'practice'),
        overrideScore: {type: DataTypes.DOUBLE, field: 'override_score'},
        open: DataTypes.BOOLEAN,
        credit: DataTypes.INTEGER,
        mode: DataTypes.ENUM('Exam', 'Public'),
    }, {
        tableName: 'submissions',
        classMethods: {
            associate: function(models) {
                Submission.belongsTo(models.QuestionInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                Submission.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return Submission;
};
