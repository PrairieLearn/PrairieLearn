module.exports = function(sequelize, DataTypes) {
    var TestScore = sequelize.define("TestScore", {
        date: DataTypes.DATE,
        points: DataTypes.DOUBLE,
        maxPoints: DataTypes.DOUBLE,
        scorePerc: DataTypes.INTEGER,
        testInstanceId: {type: DataTypes.INTEGER, field: 'test_instance_id'},
        authUserId: {type: DataTypes.INTEGER, field: 'auth_user_id'},
    }, {
        tableName: 'test_scores',
        classMethods: {
            associate: function(models) {
                TestScore.belongsTo(models.TestInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
                TestScore.belongsTo(models.User, {as: 'auth_user'}, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
    });

    return TestScore;
};
