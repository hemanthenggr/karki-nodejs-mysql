const connection = require('./../config/db')

const getDetails = (req, res) => {
    connection.query('select * from `drivers`', (err, results) => {
        if (err) return console.error(err.message);

        // get inserted rows
        res.send(results);
    })
}

module.exports = {
    getDetails
}