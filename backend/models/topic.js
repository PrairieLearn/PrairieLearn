module.exports = function(sequelize, DataTypes) {
    var Topic = sequelize.define("Topic", {
        name: DataTypes.STRING,
        number: DataTypes.INTEGER,
        color: DataTypes.STRING,
    }, {
        tableName: 'topics',
        classMethods: {
            associate: function(models) {
                Topic.belongsTo(models.Course, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return Topic;
};
