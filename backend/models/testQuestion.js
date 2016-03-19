module.exports = function(sequelize, DataTypes) {
    var TestQuestion = sequelize.define('TestQuestion', {
        number: DataTypes.INTEGER,
        maxPoints: {type: DataTypes.FLOAT, field: 'max_points'},
        pointsList: {type: DataTypes.ARRAY(DataTypes.FLOAT), field: 'points_list'},
        initPoints: {type: DataTypes.FLOAT, field: 'init_points'},
    }, {
        tableName: 'test_questions',
        classMethods: {
            associate: function(models) {
                TestQuestion.belongsTo(models.Zone);
                TestQuestion.belongsTo(models.Question);
            }
        }
    });

    return TestQuestion;
};
