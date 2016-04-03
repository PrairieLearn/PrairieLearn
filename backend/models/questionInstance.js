module.exports = function(sequelize, DataTypes) {
    var QuestionInstance = sequelize.define("QuestionInstance", {
        qiid: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        testQuestionId: {type: DataTypes.INTEGER, field: 'test_question_id'},
        testInstanceId: {type: DataTypes.INTEGER, field: 'test_instance_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
        variant_seed: DataTypes.STRING,
        params: DataTypes.JSONB,
        trueAnswer: DataTypes.JSONB,
        options: DataTypes.JSONB,
    }, {
        tableName: 'question_instances',
        classMethods: {
            associate: function(models) {
                QuestionInstance.belongsTo(models.TestQuestion, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                QuestionInstance.belongsTo(models.TestInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                QuestionInstance.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return QuestionInstance;
};
