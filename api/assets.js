const express = require('express')
const {
    pool,
    s3,
    checkImageMIMEType,
    checkImageSize,
    addToIndex
} = require('./helpers.js')
let router = express()


//get an asset by it's ID
router.get('/assets/:id', async (req, res, next) => {

    let asset_id = req.params.id

    let client = null
    let query = `
    SELECT * FROM assets WHERE asset_id = $1
    `
    try {
        client = await pool.connect()
        let result = await client.query(query, [asset_id])
        await res.json({
            data: result.rows
        })
    } catch (error) {
        console.log("An error fetching the asset occured", error)
    } finally {
        client.release()
    }
})


//get all assets for a given user using query params
router.get('/assets', async (req, res, next) => {

    let user_id = req.query.user_id

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
    } catch (error) {
        console.log("An error fetching assets occured", error)
    } finally {
        client.release()
    }
})

//create a new asset
router.post('/assets', async (req, res, next) => {
    let asset = req.body.new_asset
    let user_id = req.body.user_id

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
    let file_type = null
    let ready_image = null
    if (asset.asset_image.length > 0) {
        file_type = await checkImageMIMEType(asset.asset_image)
        let file_size = await checkImageSize(asset.asset_image)

        ready_image = await (() => {
            if (file_type && file_size < 1000) {
                return {
                    body: Buffer.from(asset.asset_image, 'base64'),
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
            user_id,
            0,
            asset.asset_name,
            asset.asset_type,
            asset.asset_description,
            "https://via.placeholder.com/600",
            asset.asset_serial_number
        ])

        // use new asset_id to upload image to S3 and update asset with new URL
        let update = null
        if (ready_image) {
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

                let s3UploadPromise = s3.upload(params).promise()
                asset_image_url = s3UploadPromise.Location

                let update_query = `
            UPDATE assets
            SET asset_image_url = $1
            WHERE asset_id = $2
            RETURNING *
            `
                update = await client.query(update_query, [asset_image_url, asset_id])
                
            } catch (error) {
                await console.log("An error occured updating the assets image", error);
            }
        }

        await client.query('COMMIT')
        await console.log("Asset creation query succesfully commited!")
        if (update) {
            // Index the new asset in elastic search
            await addToIndex('asset-register-assets', 'assets_list', {
                asset_id: update.rows[0].asset_id.toString(),
                user_asset_state: update.rows[0].user_asset_state.toString(),
                asset_serial_number: update.rows[0].asset_serial_number.toString(),
                asset_name: update.rows[0].asset_name.toString(),
                asset_image_url: result.rows[0].asset_image_url.toString(),
                asset_description: update.rows[0].asset_description.toString(),
                asset_type: update.rows[0].asset_type
            })
            await res.json({
                new_asset: update.rows[0]
            }).status(200)
        } else {
            await addToIndex('asset-register-assets', 'assets_list', {
                asset_id: result.rows[0].asset_id.toString(),
                user_asset_state: result.rows[0].user_asset_state.toString(),
                asset_serial_number: result.rows[0].asset_serial_number.toString(),
                asset_name: result.rows[0].asset_name.toString(),
                asset_image_url: "https://via.placeholder.com/600",
                asset_description: result.rows[0].asset_description.toString(),
                asset_type: result.rows[0].asset_type
            })
            await res.json({
                new_asset: result.rows[0]
            }).status(200)
        }
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

//get an asset by it's ID
router.put('/assets', async (req, res, next) => {
    let is_image_change = req.body.is_image_change
    let asset = req.body.asset

    let client = null
    let query = `
    UPDATE assets
        SET user_asset_state = $1,
            asset_type = $2,
            asset_description = $3,
            asset_image_url = $4,
            asset_serial_number = $5,
            asset_name = $6
    WHERE asset_id = $7
    RETURNING *
    `

    //Check asset image is an image and is of suitable file size
    let file_type = null
    let ready_image = null
    if (asset.asset_image.length > 0) {
        file_type = await (() => {
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

        ready_image = await (() => {
            if (file_type && file_size < 1000) {
                return {
                    body: Buffer.from(asset.asset_image, 'base64'),
                    type: file_type
                }
            } else {
                throw new Error('There was a problem uploading the image')
            }
        })();

        let params = {
            Bucket: 'asset-registry-assets',
            Key: 'asset_id' + '_' + asset_id,
            Body: ready_image.body,
            ContentType: ready_image.type
        }
        console.log("uploading image");

        let s3UploadPromise = await s3.upload(params).promise()
        asset.asset_image_url = s3UploadPromise.Location
    }


    try {
        client = await pool.connect()
        let update = await client.query(query, [
            asset.user_asset_state,
            asset.asset_type,
            asset.asset_description,
            asset.asset_image_url,
            asset.asset_serial_number,
            asset.asset_name
        ])
        await res.json({
            data: update.rows
        })
        await client.release()
    } catch (error) {
        console.log("An error fetching the asset occured", error)
    }
})




module.exports = router