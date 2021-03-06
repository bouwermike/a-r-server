require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

let app = express()

app.use(morgan('tiny'))

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    next();
});

app.use(bodyParser.json({
    limit: '50mb'
}));
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true
}));

app.get('/verifyJWT', async (req, res, next) => {
    try {
        if (req.headers.authorization) {
            await jwt.verify(req.headers.authorization, process.env.JWT_SECRET) ? res.send(true) : res.send(false)
        } else {
            res.send(false)
        }
    } catch (error) {
        console.log('jwt error', error);
    }
})

app.use(require('./api/search'))

app.use('*', async (req, res, next) => {
    if (req.originalUrl == '/signin' || req.originalUrl == '/register') {
        next()
    } else {
        let token = req.headers.authorization
        if (!token) {
            res.json({
                msg: 'User is not signed in',
                path: '/login'
            })
        } else if (!jwt.verify(token, process.env.JWT_SECRET)) {
            res.json({
                msg: 'Malformed jwt',
                path: '/login'
            })
        } else {
            next()
        }
    }
})
app.use(require('./api/assets.js'))
app.use(require('./api/users.js'))

app.listen(3000, () => {
    console.log('listening');

})