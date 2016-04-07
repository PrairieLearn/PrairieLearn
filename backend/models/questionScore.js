module.exports = function(sequelize, DataTypes) {
    var QuestionScore = sequelize.define("QuestionScore", {
        date: DataTypes.DATE,
        gradingId: {type: DataTypes.INTEGER, field: 'grading_id'},
        questionInstanceId: {type: DataTypes.INTEGER, field: 'question_instance_id'},
        testScoreId: {type: DataTypes.INTEGER, field: 'test_score_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
        points: DataTypes.DOUBLE,
        maxPoints: {type: DataTypes.DOUBLE, field: 'max_points'},
    }, {
        tableName: 'question_scores',
        classMethods: {
            associate: function(models) {
                QuestionScore.belongsTo(models.Grading, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                QuestionScore.belongsTo(models.QuestionInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                QuestionScore.belongsTo(models.TestScore, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                QuestionScore.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return QuestionScore;
};
