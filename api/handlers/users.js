const bcrypt = require('bcrypt')

/**
 * Inserts a user into the users table, returning the newly inserted row
 * @param {Object} user - An object on the request which represents the user
 * @param {Object} client - the db client, drawn from a pool
 * @returns {Object} - Returns an object representing the newly inserted row 
 * @throws - Will throw if the insert fails */
const registerUser = async function (user, client) {
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

    let hashed_password = await bcrypt.hash(user.password, 10)

    //Attempt the insert, catching a general error
    try {
        let result = await client.query(query, [
            user.first_name,
            user.last_name,
            user.email,
            null,
            hashed_password

        ])
        let new_user = result.rows[0]
        return new_user
    } catch (error) {
        //log the error for debugging
        console.log("An error occured inserting the user", error)
        //return the error to be sent to the client
        return error
    }
}

/**
 * Fetches a user by email, and then compares passwords
 * @param {Object} credentials - An object contianing a username & password
 * @param {Object} client - The db client, drawn from a pool
 * @returns {Object} - The user, or the failure message
 * @throws - Will throw if the query fails */
const signInUser = async function (credentials, client) {
    let query = `
    SELECT 
    *
    FROM USERS
    WHERE email = $1
    `
    // Fetch the user and compare passwords
    try {
        let result = await client.query(query, [credentials.email])

        if (result.rows[0]) {
            let user = result.rows[0]
            let compare = await bcrypt.compare(credentials.password, user.password)

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

                return {
                    auth: true,
                    user: safe_user
                }
            } else {
                return {
                    msg: 'Incorrect password',
                    auth: false
                }
            }
        } else {
            return {
                msg: 'No user found for that email',
                auth: false
            }
        }

    } catch (error) {
        console.log(error);
        return {
            err: error,
            msg: "An error occured"
        }
    }
}

module.exports = {
    registerUser,
    signInUser
}