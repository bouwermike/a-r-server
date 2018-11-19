require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
let app = express()

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

app.use(require('./api/assets.js'))

app.listen(3000, () => {
    console.log('listening');

})