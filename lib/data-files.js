var ERR = require('async-stacktrace');
var async = require('async');
var archiver = require('archiver');

module.exports = {};

/*
  Example:

  var files = [
      {filename: 'file1.txt', contents: Buffer.from('some data')},
      {filename: 'file2.txt', contents: Buffer.from('some more data')},
  ];
  var dirname = 'datadir';
  filesToZip(files, dirname, function(err, zip) {
      // zip is a stream of the zip file data
  });

  This makes a zip file stream containing the files:

  datadir/file1.txt
  datadir/file2.txt

  If dirname is null or undefined then the files are put into the zip at the top level.
*/
module.exports.filesToZip = function(files, dirname, callback) {
    var zip = archiver.create('zip', {});
    var prefix = '';
    if (dirname) {
        zip.append(null, {name: dirname + '/'});
        prefix = dirname + '/';
    }
    async.each(files, function(file, callback) {
        zip.append(file.contents, {name: prefix + file.filename});
        callback(null);
    }, function(err) {
        if (ERR(err, callback)) return;
        zip.finalize();
        callback(null, zip);
    });
};

module.exports.streamToBuffer = function(stream, callback) {
    var data = [];
    stream.on('data', function(b) {
        data.push(b);
    });
    stream.on('error', function(err) {
        ERR(err, callback);
    });
    stream.on('end', function() {
        var buffer = Buffer.concat(data);
        callback(null, buffer);
    });
};

module.exports.filesToZipBuffer = function(files, dirname, callback) {
    module.exports.filesToZip(files, dirname, function(err, zip) {
        if (ERR(err, callback)) return;
        module.exports.streamToBuffer(zip, function(err, zipBuffer) {
            if (ERR(err, callback)) return;
            callback(null, zipBuffer);
        });
    });
};
