module.exports = function(sequelize, DataTypes) {
    var TestQuestion = sequelize.define('TestQuestion', {
        number: DataTypes.INTEGER,
        maxPoints: {type: DataTypes.FLOAT, field: 'max_points'},
        pointsList: {type: DataTypes.ARRAY(DataTypes.FLOAT), field: 'points_list'},
        initPoints: {type: DataTypes.FLOAT, field: 'init_points'},
        testId: {type: DataTypes.INTEGER, field: 'test_id'},
        zoneId: {type: DataTypes.INTEGER, field: 'zone_id'},
        questionId: {type: DataTypes.INTEGER, field: 'question_id'},
    }, {
        tableName: 'test_questions',
        classMethods: {
            associate: function(models) {
                TestQuestion.belongsTo(models.Test, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestQuestion.belongsTo(models.Zone, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestQuestion.belongsTo(models.Question, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
        paranoid: true,
    });

    return TestQuestion;
};
