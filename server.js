const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// app use
app.use(cors());
app.use(bodyParser.json());

// config || PENTING!!
const port = 3001;
const secret_key = 'alicia31';

// DB config
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ukl_coffe'
});

// connect to DB
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});


// Multer config
// Define storage for the uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'img/'); // Destination folder for storing files
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname); // Get the file extension
        cb(null, file.fieldname + '-' + uniqueSuffix + ext); // Set the filename with original extension
    }
});

// Initialize multer instance with the defined storage
const upload = multer({ storage: storage });

// ===================== AUTH =====================
// Route for handling authentication
app.post('/admin/auth', (req, res) => {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
        return res.json({ status: false, message: 'Email and password are required' });
    }

    // Query to check if user exists
    const sql = `SELECT * FROM users WHERE email = '${email}'`;

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ status: false, message: 'Error retrieving user' });
        }

        const user = result[0];

        // Check if user exists
        if (!user) {
            return res.json({ status: false, message: 'User not found' });
        }

        // Check if user exists and password matches
        if (user && user.password === password) {
            // Generate JWT token
            const token = jwt.sign({
                email: user.email
            }, secret_key, { expiresIn: '1h' });

            res.json({
                status: true,
                logged: true,
                message: 'Login Success',
                token: token
            });
        } else {
            res.json({
                status: false,
                logged: false,
                message: 'Invalid email or password'
            });
        }
    });
});

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
    }

    jwt.verify(token, secret_key, (err, decoded) => {
    if (err) {
        return res.status(403).json({ message: 'Invalid token' });
    }

    req.user = decoded;
    next();
    });
}
// ===================== AUTH-END =====================

// ===================== COFFE =====================
// Route for handling retrieval of coffee data
app.get('/coffee', (req, res) => {
    let sql = 'SELECT * FROM coffe';
    const search = req.query.search;

    // If search parameter is provided, filter results based on it
    if (search) {
        sql += ` WHERE name LIKE '%${search}%'`;
    }

    db.query(sql, (err, result) => {
        if (err) {
            res.status(500).json({ status: false, message: 'Error retrieving coffee data', error: err });
        } else {
            res.json({ status: true, data: result, message: 'Coffee has retrieved' });
        }
    });
});

// add data coffe
app.post('/coffee', verifyToken, upload.single('image'), (req, res) => {
    const { name, size, price } = req.body;
    const image = req.file.filename;

    const sql = 'INSERT INTO coffe (name, size, price, image) VALUES (?, ?, ?, ?)';
    const values = [name, size, price, image];

    db.query(sql, values, (err, result) => {
        if (err) {
            res.status(500).json({ status: false, message: 'Error adding coffee', error: err });
        } else {
            res.json({ status: true, message: 'Coffee added successfully', coffeeId: result.insertId });
        }
    });
});

// update data coffe
app.put('/coffee/:id', verifyToken, upload.single('image'), (req, res) => {
    const { name, size, price } = req.body;
    const image = req.file.filename;
    const id = req.params.id;

    const sql = 'UPDATE coffe SET name = ?, size = ?, price = ?, image = ? WHERE id = ?';
    const values = [name, size, price, image, id];

    db.query(sql, values, (err) => {
        if (err) {
            res.status(500).json({ status: false, message: 'Error updating coffee', error: err });
        } else {
            res.json({ status: true, message: 'Coffee updated successfully' });
        }
    });
});

// delete data coffe + image
app.delete('/coffee/:id', verifyToken, (req, res) => {
    const id = req.params.id;

    // Query to get the image filename
    const selectSql = `SELECT image FROM coffe WHERE id = ${
        id
    }`;

    db.query(selectSql, (err, result) => {
        if (err) {
            return res.status(500).json({ status: false, message: 'Error retrieving coffee data', error: err });
        }

        const image = result[0].image;

        // Delete the image file
        fs.unlink(`img/${image}`, (err) => {
            if (err) {
                return res.status(500).json({ status: false, message: 'Error deleting image', error: err });
            }

            // Delete the record from the database
            const deleteSql = `DELETE FROM coffe WHERE id = ${id}`;

            db.query(deleteSql, (err) => {
                if (err) {
                    return res.status(500).json({ status: false, message: 'Error deleting coffee', error: err });
                }

                res.json({ status: true, message: 'Coffee deleted successfully' });
            });
        });
    });
});
// ===================== COFFE-END =====================

// ===================== ORDER =====================
// Route for retrieving order data with order details
app.get('/order', (req, res) => {
    const sql = `
        SELECT 
            o.id AS order_id,
            o.customer_name,
            o.order_type,
            o.order_date,
            o.created_at AS createdAt,
            o.updated_at AS updatedAt,
            od.id AS detail_id,
            od.order_id,
            od.coffee_id,
            od.quantity,
            od.price,
            od.created_at AS detail_createdAt,
            od.updated_at AS detail_updatedAt
        FROM 
            orders AS o
        JOIN 
            order_details AS od ON o.id = od.order_id
    `;

    db.query(sql, (err, results) => {
        if (err) {
            res.status(500).json({ status: false, message: 'Error retrieving orders', error: err });
        } else {
            const formattedResults = formatOrderData(results);
            res.json({ status: true, data: formattedResults, message: 'Order list has retrieved' });
        }
    });
});

// Function to format the order data with nested order details
function formatOrderData(results) {
    const ordersMap = new Map();
    results.forEach((row) => {
        const orderId = row.order_id;
        if (!ordersMap.has(orderId)) {
            ordersMap.set(orderId, {
                id: orderId,
                customer_name: row.customer_name,
                order_type: row.order_type,
                order_date: row.order_date,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                order_detail: []
            });
        }
        const orderDetail = {
            id: row.detail_id,
            order_id: row.order_id,
            coffee_id: row.coffee_id,
            quantity: row.quantity,
            price: row.price,
            createdAt: row.detail_createdAt,
            updatedAt: row.detail_updatedAt
        };
        ordersMap.get(orderId).order_detail.push(orderDetail);
    });
    return Array.from(ordersMap.values());
}


// Route for adding a new order
app.post('/order', (req, res) => {
    const { customer_name, order_type, order_date, order_detail } = req.body;

    // Insert the order into the orders table
    const orderSql = `INSERT INTO orders (customer_name, order_type, order_date) VALUES (?, ?, ?)`;
    const orderValues = [customer_name, order_type, order_date];

    db.query(orderSql, orderValues, (err, result) => {
        if (err) {
            return res.status(500).json({ status: false, message: 'Error adding order', error: err });
        }

        const orderId = result.insertId;

        // Insert order details into the order_details table
        const orderDetailSql = `INSERT INTO order_details (order_id, coffee_id, quantity, price) VALUES ?`;
        const orderDetailValues = order_detail.map(item => [orderId, item.coffee_id, item.quantity, item.price]);

        db.query(orderDetailSql, [orderDetailValues], (err) => {
            if (err) {
                return res.status(500).json({ status: false, message: 'Error adding order details', error: err });
            }

            res.json({ status: true, message: 'Order added successfully', orderId });
        });
    });
});
// ===================== ORDER-END =====================

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});