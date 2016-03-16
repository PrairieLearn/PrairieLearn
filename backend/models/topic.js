module.exports = function(sequelize, DataTypes) {
    var Topic = sequelize.define("Topic", {
        name: DataTypes.STRING,
        number: DataTypes.INTEGER,
    }, {
        tableName: 'topics',
    });

    return Topic;
};
