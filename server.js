require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
    hosts: [process.env.ELASTICSEARCH_URL]
});

const {
    ping,
    createIndex,
    addToIndex,
    search
} = require('./search/elasticsearch.js')

let app = express()

app.use(morgan('tiny'))

// ping()
// createIndex();

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(bodyParser.json({
    limit: '50mb'
}));
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true
}));

app.get('/search', function (req, res) {
    // declare the query object to search elastic search and return only 200 results from the first result found. 
    // also match any data where the name is like the query string sent in
    console.log(req.query['q']);

    let body = {
        size: 10,
        from: 0,
        query: {
            prefix: {
                "asset_serial_number" : req.query['q'] 
            }
        }
    }
    // perform the actual search passing in the index, the search query and the type
    client.search({
            index: 'asset-register-assets',
            body: body,
            type: 'assets_list'
        })
        .then(results => {
            console.log(results);

            res.send(results.hits.hits);
        })
        .catch(err => {
            console.log('error', err)
            res.send([]);
        });

})


app.get('verifyJWT', async (req, res, next) => {
    if (req.headers.authorization) {
        await jwt.verify(req.headers.authorization, process.env.JWT_SECRET) ? res.send(true) : res.send(false)
        next()
    } else {
        res.send(false)
        next()
    }
})

app.use('*', async (req, res, next) => {
    console.log(req.body);

    if (req.originalUrl == '/signin' || req.originalUrl == '/register') {
        next()
    } else {
        let token = req.headers.authorization
        if (!token) {
            res.json({
                msg: 'User is not signed in',
                path: '/login'
            })
        } else if (jwt.verify(token, process.env.JWT_SECRET)) {
            next()
        }
    }
})
app.use(require('./api/assets.js'))
app.use(require('./api/users.js'))

app.listen(3000, () => {
    console.log('listening');

})