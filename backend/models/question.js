module.exports = function(sequelize, DataTypes) {
    var Question = sequelize.define('Question', {
        qid: {type: DataTypes.STRING, unique: true},
        type: DataTypes.ENUM('Calculation', 'MultipleChoice', 'Checkbox', 'File', 'MultipleTrueFalse'),
        title: DataTypes.STRING,
        config: DataTypes.JSONB,
    }, {
        tableName: 'questions',
        classMethods: {
            associate: function(models) {
                Question.belongsTo(models.Course, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
                Question.belongsTo(models.Topic, {onUpdate: 'SET NULL', onDelete: 'SET NULL'});
            }
        },
        paranoid: true,
    });

    return Question;
};
