var Promise = require('bluebird');
var models = require('../models');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT t.id,t.tid,t.type,t.number,t.title,s.short_name,s.long_name,'
            + '(lag(s.id) OVER (PARTITION BY s.id ORDER BY t.number) IS NULL) AS start_new_set'
            + ' FROM tests AS t LEFT JOIN test_sets AS s ON (s.id = t.test_set_id)'
            + ' ORDER BY (s.long_name, s.id, t.number)'
            + ';'
        var params = {
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        res.render('tests', {navTests: true, results: results});
    })
});

module.exports = router;
