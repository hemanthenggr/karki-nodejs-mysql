const connection = require('./../config/db')

const getData = (query) => {
    return new Promise((resolve, reject) => {
        try {
            connection.query(query, (err, results) => {
                if (err) reject(err)
                resolve(results)
            })
        } catch (error) {
            reject(error)
        }
    })
}

const responseErrorJson = (msg) => {
    return {
        error: true,
        message: msg,
        data: []
    }
}

const responseSuccessJson = (data, msg) => {
    return {
        error: null,
        message: msg,
        data
    }
}

// parameter in seconds 
const sleepUntil = async (sec) => {
    new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(true)
        }, sec * 1000)
    })
}

const sendNotification = (id, data) => {
    // return
}

// book ride api
const bookMyRide = async (req, res) => {
    try {
        let discountedAmount = "", DISTANCE_KILOMETERS = "", drivers = [];
        const {
            kms,
            price,
            user_id: userId,
            drop_text: dropText,
            pickup_long: LONGITUDE, // should ask if pickup_text or pickup_long
            pickup_lat: LATITUDE,
            drop_lat: DROPLATITUDE,
            drop_long: DROPLONGITUDE,
            pickup_text: pickupText,
            category_id: categoryId,
            coupon_code: couponCode,
            payment_mode: paymentMode
        } = req.body

        // check category
        if (!categoryId) return res.json(responseErrorJson("Sorry, Category ID not Found."))

        if (couponCode) {
            let results = await getData(`SELECT * FROM coupons WHERE code = "${couponCode}" AND is_active != 0 LIMIT 1`)
            if (results?.length == 0) return res.json(responseErrorJson("Coupon not Exist"))
            discountedAmount = getDiscountedAmount(results, price)
        }

        let userData = await getData(`SELECT * FROM users WHERE id = "${userId}" AND status = TRUE AND user_type = 'USER'`)
        if (userData?.length == 0) {
            return res.json(responseErrorJson("Your details not found for booking ride."))
        } else {
            userData = userData[0]
        }

        let settings = await getData(`SELECT * FROM settings WHERE option_key='driver_km'`)
        DISTANCE_KILOMETERS = settings && settings.length ? (settings[0] && settings[0]['option_value'] ? settings[0]['option_value'] : 3) : 3

        let distanceQuery = `SELECT * FROM (
            SELECT *, 
                (
                    (
                        (
                            acos(
                                sin(( ${LATITUDE} * pi() / 180))
                                *
                                sin(( location_lat * pi() / 180)) + cos(( ${LATITUDE} * pi() / 180 ))
                                *
                                cos(( location_lat * pi() / 180)) * cos((( ${LONGITUDE} - location_long) * pi() / 180)))
                        ) * 180/pi()
                    ) * 60 * 1.1515 * 1.609344
                )
            as distance FROM users 
            ) users
            WHERE distance <= ${DISTANCE_KILOMETERS} 
            AND  is_active = 1
            AND  status = 1 
            AND notification_status = 0
            AND subscription_days > 0
            AND user_type = 'DRIVER'
            AND app_token_id != ''
            AND category_id = ${categoryId}
            ORDER BY distance ASC`

        drivers = await getData(distanceQuery)

        distanceQuery = `SELECT * FROM (
            SELECT *, 
                (
                    (
                        (
                            acos(
                                sin(( ${LATITUDE} * pi() / 180)) *
                                sin(( goto_location_lat * pi() / 180)) + cos(( ${LATITUDE} * pi() / 180 )) *
                                cos(( goto_location_lat * pi() / 180)) * cos((( ${LONGITUDE} - goto_location_long ) * pi() / 180)))
                        ) * 180 / pi()
                    ) * 60 * 1.1515 * 1.609344
                )
            as distance FROM users 
            ) users
        WHERE distance <= 1 
            AND  is_active = 2
            AND  status = 1 
            AND notification_status = 0
            AND user_type = 'DRIVER'
            AND subscription_days > 0
            AND app_token_id != ''
            AND category_id = ${categoryId}
        ORDER BY distance ASC`

        let driver2 = await getData(distanceQuery)

        if (driver2 && driver2.length > 0) {
            driver2.forEach(ele => {
                drivers.push(ele)
            });
        }
        driver2 = null;

        if (driver?.length == 0) return res.json(responseErrorJson("Sorry, Current all drivers are booked, Please try some time later."))

        let transactionId = await getData(`INSERT INTO wallet (amount, user_id, coupon_code, razorpay, transaction, created_by, order_mode) VALUES ('${price}', '${userId}', ${couponCode}, 'fromBooking', 'debit', '${userId}', '${paymentMode}')`)

        // let transactionId = await getData(`INSERT INTO wallet (amount, user_id, coupon_code, razorpay, transaction, created_by, order_mode) VALUES ('23423', '123123', null, 'fromBooking', 'debit', '123123', 'online', 'ffgdfgdfg')`)

        if (transactionId?.errno) return res.json(responseErrorJson("Something went wrong in transactions."))
        transactionId = transactionId?.insertId

        if (paymentMode?.toLowerCase() !== 'cod') {
            let updatePrice = couponCode ? discountedAmount : price

            let userUpdate = await getData(`UPDATE user SET amount = ${userData.amount - updatePrice} WHERE id = ${userId}`)
            if (userUpdate?.errno) return res.json(responseErrorJson("Something went wrong in transactions."))

            let adminBalance = await getData(`SELECT * FROM users WHERE id = 1`)
            adminBalance = adminBalance[0]

            userUpdate = await getData(`UPDATE user SET amount = ${adminBalance.amount + updatePrice} WHERE id = 1`)

            await getData(`INSERT INTO wallet (amount, user_id, coupon_code, razorpay, transaction, created_by, order_mode, created_date) VALUES ('${price}', 1, ${couponCode}, 'fromBooking', 'credit', '${userId}', '${paymentMode}'), ${date('Y-m-d h:i:s')}`)
        }

        let userOrder = await getData(`INSERT INTO user_orders (kms, user_id, price, created_by, drop_lat, drop_text, drop_long, pickup_lat, pickup_text, pickup_long, payment_mode, coupon_code, otp, transaction_id, created_date, category_id) VALUES ('${kms}', '${userId}', ${price}, '${userId}', '${DROPLATITUDE}', '${dropText}', '${DROPLONGITUDE}', '${LATITUDE}', '${pickupText}', '${LONGITUDE}', '${paymentMode}', '${couponCode}', '${random_string('numeric', 6)}', '${transactionId}', ${date('Y-m-d h:i:s')}, '${categoryId}'`)
        if (userOrder?.errno) return res.json(responseErrorJson("Ride not booked"))
        let userOrderId = userOrder.insertId;

        let userWait = 0
        for (let i = 0; i < drivers.length; $i++) {
            let driver = drivers[i]
            let wsec = 10
            userWait += wsec

            let currentOrder = await getData(`SELECT * FROM user_orders WHERE id='${userOrderId}'`)
            let nextDriver = await getData(`SELECT * FROM users WHERE id='${driver.id}' AND is_active = 1 AND notification_status = 0`)

            if (nextDriver?.length > 0) {
                nextDriver = nextDriver[0]
                currentOrder = currentOrder[0]

                if (nextDriver.status == 1 && currentOrder.status == 0) {
                    await getData(`UPDATE driver_orders SET status = 6 WHERE id = 1 AND user_order_id = ${userOrderId}`)

                    let driverOrderId = await getData(`INSERT INTO driver_orders (user_order_id, driver_id, price, created_by, created_date) VALUES ('${userOrderId}', '${nextDriver.id}', ${currentOrder.price}, '${userId}', ${date('Y-m-d h:i:s')}`)
                    driverOrderId = driverOrderId?.insertId

                    if (!driverOrderId) {
                        wsec = 0
                        userWait -= 10
                    }

                    let notification = sendNotification(nextDriver.app_token_id, {
                        title: "You have new request",
                        body: ucfirst(userData.first_name) + " has booked a new ride, Dont keep them waiting.",
                        kms: kms,
                        userOrder_id: userOrderId,
                        user_id: userId,
                        drop_lat: DROPLATITUDE,
                        drop_text: dropText,
                        drop_long: DROPLONGITUDE,
                        pickup_lat: LATITUDE,
                        pickup_text: pickupText,
                        pickup_long: LONGITUDE,
                        category_id: categoryId,
                        user_mobile: userData.mobile,
                        driverOrder_id: driverOrderId,
                        user_first_name: userData.first_name,
                        user_profile_pic: userData.profile_pic,
                        pickup_distance: driver.distance,
                        amount: currentOrder.price
                    })

                    if (!notification) {
                        wsec = 0;
                        userWait -= 10;

                        await getData(`UPDATE users SET notification_status = 1 WHERE id = ${nextDriver.id}`)
                    }

                    await sleepUntil(wsec)
                    let currentOrderDup = await getData(`SELECT * FROM user_orders WHERE id='${userOrderId}'`);
                    currentOrderDup = currentOrderDup[0]

                    await getData(`UPDATE users SET notification_status = 0 WHERE id = ${nextDriver.id}`)

                    if (currentOrderDup.status == 4) {

                        nextDriver = [];
                        let acceptedByQuery = await getData(`SELECT driver_id FROM driver_orders WHERE id='${userOrderId}' AND user_order_id='${userOrderId}' AND status = 2`);
                        acceptedByQuery = acceptedByQuery[0]
                        let acceptedBy = acceptedByQuery?.driver_id ? acceptedByQuery.driver_id : ""

                        nextDriver = await getData(`SELECT * FROM users WHERE id='${acceptedBy}'`);
                        nextDriver = nextDriver[0] || {}

                        userOrder = await getData(`SELECT * FROM user_orders WHERE id='${userOrderId}'`);
                        userOrder = userOrder[0] || {}

                        userOrder.driver_profile_pic = nextDriver.profile_pic
                        userOrder.driver_first_name = nextDriver.first_name
                        userOrder.driver_mobile = nextDriver.mobile
                        userOrder.driver_id = nextDriver.id

                        return res.json(responseSuccessJson(userOrder, "Book Ride Successfully"))
                    } else if(currentOrderDup.status == 0) {

                        let notification = sendNotification(nextDriver.app_token_id, {
                            title: "Your raid has been missed",
                            body: ucfirst(nextDriver.first_name) + " your raid has been missed.",
                            status: "missed"
                        });

                        await getData(`UPDATE driver_orders SET status = 6 WHERE user_order_id = ${userOrderId}`)
                    } else if(currentOrderDup.status == 3){

                        let notification = sendNotification(nextDriver.app_token_id, {
                            title: "Sorry, Your order has been cancelled by user",
                            body: ucfirst(nextDriver.first_name) + " your raid has been cancelled.",
                            status: "cancelled"
                        });

                        await getData(`UPDATE driver_orders SET status = 7 WHERE user_order_id = ${userOrderId}`)

                        userOrder = await getData(`SELECT * FROM user_orders WHERE id='${userOrderId}'`);
                        userOrder = userOrder[0] || {}

                        userOrder.driver_profile_pic = nextDriver.profile_pic
                        userOrder.driver_first_name = nextDriver.first_name
                        userOrder.driver_mobile = nextDriver.mobile
                        userOrder.driver_id = nextDriver.id

                        return res.json(responseSuccessJson(userOrder, "Book Ride cancelled by user"))
                    }

                    if(i == (drivers.length - 1) || userWait == 60){

                        let notification = sendNotification(userData.app_token_id, {
                            title: "Your booked ride cancelled",
                            body: ucfirst(userData.first_name) + " no driver accepts Your Order, So will be cancelled.", 
                            userOrder_id: userData.id,
                            user_id: userData.id
                        });

                        await getData(`UPDATE user_orders SET status = 3 WHERE id = ${userOrderId}`)
                        await getData(`UPDATE driver_orders SET status = 6 WHERE user_order_id = ${userOrderId}`)

                        userOrder = await getData(`SELECT * FROM user_orders WHERE id='${userOrderId}'`);
                        userOrder = userOrder[0] || {}

                        userOrder.driver_profile_pic = nextDriver.profile_pic
                        userOrder.driver_first_name = nextDriver.first_name
                        userOrder.driver_mobile = nextDriver.mobile
                        userOrder.driver_id = nextDriver.id

                        return res.json(responseSuccessJson(userOrder, "Book Ride cancelled. All drivers are busy."))
                    }
                }
            }
        }

    } catch (error) {
        res.send(error)
    }
}

module.exports = {
    bookMyRide
}