var Promise = require('bluebird');
var models = require('../models');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT id,tid,type,number,title,test_set_id FROM tests'
            + ' WHERE deleted_at IS NULL'
            + ';'
        var params = {
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        res.render('tests', {navTests: true, results: results});
    })
});

module.exports = router;
