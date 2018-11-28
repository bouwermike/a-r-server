const express = require('express');
const {
    search
} = require('./helpers.js')
let router = express()


router.get('/search', async (req, res, next) => {
    let query_params = {
        size: 10,
        from: 0,
        query: {
            prefix: {
                "asset_serial_number": req.query['q']
            }
        }
    }

    let result = await search('asset-register-assets', 'assets_list', query_params)

    res.send(result)
})

module.exports = router