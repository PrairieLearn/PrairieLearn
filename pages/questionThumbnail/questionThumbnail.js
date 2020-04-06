var path = require('path');
var express = require('express');
var fs = require('fs');
var router = express.Router();

router.get('/*', function(req, res, _next) {
    var filename = req.params[0];
    var clientFilesDir = path.join(
        res.locals.course.path,
        'questions',
        filename,
    );
    if (fs.existsSync(path.join(clientFilesDir, 'thumbnail.jpg'))) {
        res.sendFile('thumbnail.jpg', {maxAge: 86400000 * 30, root: clientFilesDir});
        return;
    }
    if (fs.existsSync(path.join(clientFilesDir, 'thumbnail.png'))) {
        res.sendFile('thumbnail.png', {maxAge: 86400000 * 30, root: clientFilesDir});
        return;
    }
    if (fs.existsSync(path.join(clientFilesDir, 'thumbnail.jpeg'))) {
        res.sendFile('thumbnail.jpeg', {maxAge: 86400000 * 30, root: clientFilesDir});
        return;
    }
    if (fs.existsSync(path.join(clientFilesDir, 'thumbnail.svg'))) {
        res.sendFile('thumbnail.svg', {maxAge: 86400000 * 30, root: clientFilesDir});
        return;
    }
    if (fs.existsSync(path.join(clientFilesDir, 'thumbnail.gif'))) {
        res.sendFile('thumbnail.gif', {maxAge: 86400000 * 30, root: clientFilesDir});
        return;
    }
    res.sendStatus(404);
});

module.exports = router;
