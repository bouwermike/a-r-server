const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
   hosts: [ process.env.ELASTICSEARCH_URL ]
});

const ping = () => {
    client.ping({
        requestTimeout: 30000,
    }, function(error) {
    // at this point, eastic search is down, please check your Elasticsearch service
        if (error) {
            console.error('Elasticsearch cluster is down!');
        } else {
            console.log('Everything is ok');
        }
    });
}

const createIndex = () => {
    client.indices.create({
        index: 'asset-register-assets'
    }, function(error, response, status) {
        if (error) {
            console.log("index already exists, failing safely");
        } else {
            console.log("created a new index", response);
        }
  });
}

const addToIndex = (index, type, body ) => {
    client.index({
        index: index ,
        type: type,
        body: body
    }, function(err, resp, status) {
        if (err) {
            throw err
        } else {
            console.log('index added', {resp , status});
        }
    });
}

const search = (body, res) => {
    client.search({
        index: 'asset-register-assets',
        body: body,
        type: 'assets_list'
    })
    .then(results => {
        res.send(results.hits.hits);
    })
    .catch(err => {
        console.log(err)
        res.send([]);
    });

}

module.exports = { ping, createIndex, addToIndex, search }