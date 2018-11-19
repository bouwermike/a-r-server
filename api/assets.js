const express = require('express')
const {
    Pool
} = require('pg')
const {
    s3
} = require('../aws.js')
let router = express()


//get an asset
router.get('/assets', async (req, res, next) => {

    let user_id = req.query.user_id

    const pool = new Pool({
        connectionString: process.env.DB_URI,
        ssl: true
    })
    let client = null
    let query = `
    SELECT * FROM assets WHERE user_id = $1
    `
    try {
        client = await pool.connect()
        let result = await client.query(query, [user_id])
        await res.json({
            data: result.rows
        })
        await client.release()
    } catch (error) {
        console.log("An error fetching assets occured", error)
    }
})

//create a new asset
router.post('/assets', async (req, res, next) => {
    let asset = req.body.new_asset
    let user_id = req.body.user_id
    const pool = new Pool({
        connectionString: process.env.DB_URI,
        ssl: true
    })

    let client = null
    let query = `
    INSERT INTO assets(
        user_id,
        user_asset_state,
        asset_name,
        asset_type,
        asset_description,
        asset_image_url,
        asset_serial_number
    ) 
    VALUES (
        $1,$2,$3,$4,$5,$6,$7
    )
    RETURNING *
    `

    //Check asset image is an image and is of suitable file size
    let file_type = await (() => {
        switch (asset.asset_image.slice(0, 1)) {
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
    })();
    let file_size = await Buffer.byteLength(asset.asset_image) / 1000

    let ready_image = await (() => {
        if (file_type && file_size < 1000) {
            return {
                body: Buffer.from(asset.asset_image, 'base64'),
                type: file_type
            }
        } else {
            throw new Error('There was a problem uploading the image')
        }
    })();

    //Attempt to connect to the pool, catching a connection error if fail                
    try {
        client = await pool.connect()
    } catch (error) {
        console.log("A connection error occured", error)
    }

    //Begin the query, catching an error will attempt a rollback
    try {
        await client.query('BEGIN')
        result = await client.query(query, [
            user_id,
            0,
            asset.asset_name,
            asset.asset_type,
            asset.asset_description,
            "https://via.placeholder.com/600",
            asset.asset_serial_number
        ])
        await client.query('COMMIT')
        await console.log("Asset creation query succesfully commited!")

        // use new asset_id to upload image to S3 and update asset with new URL

        try {
            let asset_image_url = ''
            let asset_id = result.rows[0].asset_id
            let params = {
                Bucket: 'asset-registry-assets',
                Key: 'asset_id' + '_' + asset_id,
                Body: ready_image.body,
                ContentType: ready_image.type
            }
            console.log("uploading image");

            let s3UploadPromise = await s3.upload(params).promise()
            asset_image_url = s3UploadPromise.Location

            let update_query = `
                UPDATE assets
                SET asset_image_url = $1
                WHERE asset_id = $2
                RETURNING *
                `
            await client.query('BEGIN')
            update = await client.query(update_query, [asset_image_url, asset_id])
            await client.query('COMMIT')
            await console.log("Asset update query succesfully commited!")
        } catch (error) {
            await console.log("An error occured updating the assets image", error);
            await client.query('ROLLBACK')
        }

        await res.json({
            new_asset: update.rows[0]
        }).status(200)
    }

    //Begin roll back if error caught
    catch (error) {
        try {
            await console.log("There was an error commiting the asset creation query", error)
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




module.exports = router