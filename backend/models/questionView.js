module.exports = function(sequelize, DataTypes) {
    var QuestionView = sequelize.define("QuestionView", {
        mongoId: {type: DataTypes.STRING, unique: true},
        date: DataTypes.DATE,
        questionInstanceId: {type: DataTypes.INTEGER, field: 'question_instance_id'},
        open: DataTypes.BOOLEAN,
        credit: DataTypes.INTEGER,
        mode: DataTypes.ENUM('Exam', 'Public'),
    }, {
        tableName: 'question_views',
        classMethods: {
            associate: function(models) {
                QuestionView.belongsTo(models.QuestionInstance, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return QuestionView;
};
