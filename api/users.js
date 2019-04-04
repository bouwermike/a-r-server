const express = require('express')
const {
    pool,
    s3,
    s3Upload,
    checkImageMIMEType,
    checkImageSize
} = require('./helpers.js')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let router = express()
const userHelpers = require('./handlers/users.js')


//create a new user
router.post('/register', async (req, res, next) => {
    let user = req.body.new_user
    let client = await pool.connect()

    try {
        let new_user = await userHelpers.registerUser(user, client)
        let token = await jwt.sign(new_user, process.env.JWT_SECRET)
        console.log("releasing vibes");
        console.log("sending vibes");
        res.json({
            user: new_user,
            token: token
        })
    } catch (error) {
        console.log("register controller error", error);

        res.json({
            error: error
        }).status(400)

    } finally {
        client.release()
    }
})

//signin a user
router.post('/signin', async (req, res, next) => {
    let credentials = req.body.credentials
    console.log(req.body);

    let client = await pool.connect()
    try {
        let response = await userHelpers.signInUser(credentials, client)
        let token = await jwt.sign(response.user, process.env.JWT_SECRET)
        response.token = token
        res.json(response)
    } catch (error) {
        console.log("sigin controller error", error);

        res.json({
            error: error
        }).status(400)
    } finally {
        client.release()
    }
})


module.exports = router