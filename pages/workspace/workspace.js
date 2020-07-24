const express = require('express');
const router = express.Router();

router.get('/:workspace_id', (req, res, _) => {
    res.render(__filename.replace(/\.js$/, '.ejs'), {id:req.params.workspace_id});
});

module.exports = router;
