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


//create a new user
router.post('/register', async (req, res, next) => {
    let user = req.body.new_user

    let client = null
    let query = `
    INSERT INTO users(
        first_name,
        last_name,
        email,
        user_image_url,
        password
    ) 
    VALUES (
        $1,$2,$3,$4,$5
    )
    RETURNING *
    `
    //Encrypt the users password
    let hash = await bcrypt.hash(user.password, 10)

    //Check user image is an image and is of suitable file size
    let file_type = null
    let ready_image = null
    if (user.user_image) {
        file_type = await checkImageMIMEType(user.user_image)
        let file_size = await checkImageSize(user.user_image)

        ready_image = await (() => {
            if (file_type && file_size < 1000) {
                return {
                    body: Buffer.from(user.user_image, 'base64'),
                    type: file_type
                }
            } else {
                throw new Error('There was a problem uploading the image')
            }
        })();
    }


    //Attempt to connect to the pool, catching a connection error if fail                
    try {
        client = await pool.connect()
    } catch (error) {
        console.log("A connection error occured", error)
    }

    //Begin the query, catching an error will attempt a rollback
    let result = null
    try {
        await client.query('BEGIN')
        result = await client.query(query, [
            user.first_name,
            user.last_name,
            user.email,
            "https://via.placeholder.com/600",
            hash

        ])

        // use new asset_id to upload image to S3 and update asset with new URL
        let update = null
        if (ready_image) {
            try {
                let user_image_url = ''
                let user_id = result.rows[0].user_id
                let params = {
                    Bucket: 'asset-registry-users',
                    Key: 'user_id' + '_' + user_id,
                    Body: ready_image.body,
                    ContentType: ready_image.type
                }
                console.log("uploading image");

                let s3UploadPromise = await s3.upload(params).promise()
                user_image_url = s3UploadPromise.Location

                let update_query = `
                    UPDATE users
                    SET user_image_url = $1
                    WHERE user_id = $2
                    RETURNING *
                    `

                update = await client.query(update_query, [user_image_url, user_id])

            } catch (error) {
                await console.log("An error occured updating the users image", error);
            }
        }

        await client.query('COMMIT')
        await console.log("User update query succesfully commited!")

        if (update) {
            let token = jwt.sign(update.rows[0], process.env.JWT_SECRET)
            await res.json({
                user: update.rows[0],
                token: token
            }).status(200)
        } else {
            let token = jwt.sign(result.rows[0], process.env.JWT_SECRET)
            await res.json({
                user: result.rows[0],
                token: token
            }).status(200)
        }
    }


    //Begin roll back if error caught
    catch (error) {
        try {
            await console.log("There was an error commiting the user creation query", error)
            await console.log("Rolling back!")
            await client.query('ROLLBACK')
        } catch (rollbackError) {
            console.log("Attempted to rollback, but error occured", rollbackError)
        }
    }
    //Release the client back into the pool
    finally {
        client.release()
    }
})

//signin a user
router.post('/signin', async (req, res, next) => {
    let signin_packet = req.body.signin_packet

    let client = null
    let query = `
    SELECT 
    *
    FROM USERS
    WHERE email = $1
    `
    //Attempt to connect to the pool, catching a connection error if fail                
    try {
        client = await pool.connect()
    } catch (error) {
        console.log("A connection error occured", error)
    }
    // Fetch the user and compare passwords
    try {
        let result = await client.query(query, [signin_packet.email])

        if (result.rows[0]) {
            let user = result.rows[0]
            let compare = await bcrypt.compare(signin_packet.password, user.password)

            if (compare) {
                let safe_user = {
                    user_id: user.user_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    user_image_url: user.user_image_url,
                    verified: user.verified,
                    created: user.created
                }
                let token = jwt.sign(safe_user, process.env.JWT_SECRET)
                res.json({
                    auth: true,
                    user: safe_user,
                    token: token
                })
            } else {
                res.json({
                    msg: 'Incorrect password',
                    auth: false
                })
            }
        } else {
            res.json({
                msg: 'No user found for that email',
                auth: false
            })
        }

    } catch (error) {
        console.log(error);

    } finally {
        client.release()
    }

})


module.exports = router