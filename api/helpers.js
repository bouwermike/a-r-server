/*
### PostgresDB helpers ###

A simple pool for clients to connect to. !ALWAYS RELEASE CLIENTS IN A FINALLY BLOCK!

*/
const {
    Pool
} = require('pg')

const pool = new Pool({
    connectionString: process.env.DB_URI,
    ssl: true
})


/*
### S3 helpers ###

A collection of helpers to allow easy connection and manipulation of S3 buckets

*/
const aws = require('aws-sdk');

aws.config.update({
    secretAccessKey: process.env.AWS_SECRET,
    accessKeyId: process.env.AWS_ACCESSKEYID,
    region: 'us-east-1' //is this correct?
});

const s3 = new aws.S3();

/**
 * A promisified generic S3 upload
 * @param {Object} params - An object containing the neccesary Bucket, Key, Content Type and Body for the upload
 * @returns {Object} Promise resolves with an S3 object representing the newly uploaded asset. */
const s3Upload = (params) => {
    s3.upload(params).promise()
}


/*
### Image helpers ###

A collection of helpers to allow easy size limiting, file manipulating etc. of images

*/

/**
 * Checks for the MIME type of an image buffer string, and throws an error if the MIME type is not accepted
 * @param {string} buffer - The buffer string representing the image
 * @returns {string} The buffer string's MIME type
 */
const checkImageMIMEType = (buffer) => {
    let MIMEType = buffer.slice(0, 1)
    switch (MIMEType) {
        case '/':
            return 'image/jpeg'
            break;
        case 'i':
            return 'image/png'
            break;
        case 'R':
            return 'image/gif'
            break;
        default:
            throw new Error('File type is not an accepted image type')
            break;
    }
}
/**
 * Checks the size of an image buffer string in kilobytes
 * @param {string} buffer - The buffer string representing the image
 * @returns {Number} The number of kilobytes in the buffer string
 */
const checkImageSize = (buffer) => {
    return Buffer.byteLength(buffer) / 1000
}

/*
### Elasticsearch helpers ###

A collection of helpers to allow easy creation of indexes, indexing of entries and searching in Elasticsearch

*/

const elasticsearch = require('elasticsearch');
const es_client = new elasticsearch.Client({
    hosts: [process.env.ELASTICSEARCH_URL]
});

/**
 * Pings the elastic search instance and throws an error if down
 * @param {number} request_timeout - The number of seconds before the ping times out
 * @returns {Object} A message and an error. Error is null if all ok.
 */
const ping = (request_timeout) => {
    es_client.ping({
        requestTimeout: request_timeout,
    }, function (error) {
        if (error) {
            return {
                msg: "Elasticsearch is down!",
                error: error
            }
        } else {
            return {
                msg: "Elasticsearch is up!",
                error: null
            }
        }
    });
}

/**
 * Creates a new index on the elasticsearch instance
 * @param {string} index_name - The name of the new index to be created
 * @returns {Object} The status, response and/or error returned by elasticsearch
 */
const createIndex = (index_name) => {
    es_client.indices.create({
        index: index_name
    }, function (error, response, status) {
        if (error) {
            return {
                msg: "There was an error creating the index",
                status: status,
                error: error
            }
        } else {
            return {
                msg: "Index created",
                status: status,
                response: response
            }
        }
    });
}

/**
 * Adds an entry to an index
 * @param {string} index - The index to add to
 * @param {string} type - The type on the index
 * @param {Object} body - The entry to add
 * @returns {Object} The status, response and/or error returned by elasticsearch 
 */
const addToIndex = (index, type, body) => {
    es_client.index({
        index: index,
        type: type,
        body: body
    }, function (error, response, status) {
        if (error) {
            return {
                msg: 'An error occured adding the entry',
                status: status,
                error: error
            }
        } else {
            return {
                msg: 'Entry added succesfully',
                status: status,
                response: response
            }
        }
    });
}

/**
 * Searches the given index for types that match the query_params
 * @param {string} index - The index to add to
 * @param {string} type - The type on the index
 * @param {Object} query_params - An object detailing what to query by, how maynresults to return etc.
 * @returns {*} The result of the search, or an error
 */
const search = async (index, type, query_params) => {
    try {
        let result = await es_client.search({
            index: index,
            body: query_params,
            type: type
        })
        return result.hits.hits
    } catch (error) {
        console.log(error);
    }
}

/*
### Exports ###

Make all helpers available through exports

*/

module.exports = {
    s3,
    pool,
    s3Upload,
    checkImageMIMEType,
    checkImageSize,
    ping,
    createIndex,
    addToIndex,
    search
}