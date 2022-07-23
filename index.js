const express = require('express')
const cors = require('cors')

const connection = require('./config/db')
const routes = require('./routes')
require("dotenv").config()

const app = express()

// middleware
app.use(cors({
    origin: "http://localhost:8081" // server url
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// route integration
app.use('/api', routes)

// mysql connection
connection.connect((err) => {
    if (err) return console.error(`error: ${err.message}`)

    console.log('Connected to the MySQL server.');
});

// entry point
app.get("/", (req, res) => {
    res.json({
        message: "extend api service"
    })
})

// server initalize
const port = process.env.PORT || 8000
app.listen(port, () => console.log(`server running at ${port}`))