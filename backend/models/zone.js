module.exports = function(sequelize, DataTypes) {
    var Zone = sequelize.define("Zone", {
        title: DataTypes.STRING,
        number: DataTypes.INTEGER,
    }, {
        tableName: 'zones',
        classMethods: {
            associate: function(models) {
                Zone.belongsTo(models.Test, {onUpdate: 'CASCADE', onDelete: 'CASCADE'});
            }
        },
    });

    return Zone;
};
