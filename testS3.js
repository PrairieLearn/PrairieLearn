var AWS = require('aws-sdk');

var config = {
  s3ForcePathStyle: true,
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER',
  endpoint: new AWS.Endpoint('http://localhost:5000')
}

var s3 = new AWS.S3(config)

var myBucket = 'my.unique.bucket.name';

var myKey = 'myBucketKey';

console.log('about to createBucket');
s3.createBucket({Bucket: myBucket}, function(err, data) {
    console.log('done createBucket');
    if (err) {
        console.log(err);
    } else {
        params = {Bucket: myBucket, Key: myKey, Body: 'Hello!'};
        s3.putObject(params, function(err, data) {
            if (err) {
                console.log(err)
            } else {
                console.log("Successfully uploaded data to myBucket/myKey");
                console.log('about to listBuckets');
                s3.listBuckets(function(err, data) {
                    console.log('done listBuckets');
                    if (err) console.log(err, err.stack); // an error occurred
                    else     console.log(data);           // successful response
                });
            }
        });
    }
});

