module.exports = function(sequelize, DataTypes) {
    var User = sequelize.define("User", {
        uid: {type: DataTypes.STRING, unique: true},
        name: DataTypes.STRING,
    }, {
        tableName: 'users',
    });

    return User;
};
