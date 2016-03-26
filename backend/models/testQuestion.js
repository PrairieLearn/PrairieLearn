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
                TestQuestion.belongsTo(models.Test, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestQuestion.belongsTo(models.Zone, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                TestQuestion.belongsTo(models.Question, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
        paranoid: true,
    });

    return TestQuestion;
};
