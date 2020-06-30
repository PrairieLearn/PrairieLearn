const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

router.get('/:workspace_id', (req, res, next) => {
    res.render(__filename.replace(/\.js$/, '.ejs'), {id:req.params.workspace_id});
});

module.exports = router;
