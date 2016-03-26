module.exports = function(sequelize, DataTypes) {
    var AccessRule = sequelize.define('AccessRule', {
        mode: DataTypes.ENUM('Exam', 'Public'),
        role: DataTypes.ENUM('Student', 'TA', 'Instructor', 'Superuser'),
        uids: DataTypes.ARRAY(DataTypes.STRING),
        startDate: {type: DataTypes.DATE, field: 'start_date'},
        endDate: {type: DataTypes.DATE, field: 'end_date'},
        credit: DataTypes.INTEGER,
    }, {
        tableName: 'access_rules',
        classMethods: {
            associate: function(models) {
                AccessRule.belongsTo(models.Test, {onDelete: 'CASCADE'});
            }
        }
    });

    return AccessRule;
};
