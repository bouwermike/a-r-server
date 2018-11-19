const aws = require('aws-sdk');

aws.config.update({
    secretAccessKey: process.env.AWS_SECRET,
    accessKeyId: process.env.AWS_ACCESSKEYID,
    region: 'us-east-1'
});

const s3 = new aws.S3();

const s3Upload = async function(bucket, key_ref, key_id, body, MIMEType) {

}


module.exports = { s3 }