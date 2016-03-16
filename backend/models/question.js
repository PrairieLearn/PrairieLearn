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
                Question.belongsTo(models.Topic);
            }
        }
    });

    return Question;
};
