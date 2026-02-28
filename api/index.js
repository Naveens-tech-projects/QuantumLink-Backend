require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// 1. Initialize the Express App
const app = express();
const port = process.env.PORT || 3000;

// 2. Middleware setup
app.use(cors()); // Allows Salesforce/React to talk to this API
app.use(express.json()); // Allows us to parse incoming JSON payloads

// 🔗 THE NEON CLOUD CONNECTION
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required to connect to Neon from localhost
    }
});

// Sanity Check Endpoint
app.get('/api/health', async (req, res) => {
    try {
        // A quick query to prove the DB is connected
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            status: 'QuantumLink API is connected to Neon Cloud!', 
            db_time: result.rows[0].now 
        });
    } catch (err) {
        console.error('Database connection failed:', err);
        res.status(500).json({ error: 'Failed to connect to Neon.' });
    }
});
// 5. USE CASE 1: Autonomous Warranty Lookup Endpoint
app.get('/api/warranty/:serialNumber', async (req, res) => {
    try {
        const { serialNumber } = req.params;
        
        // Use $1 to prevent SQL Injection
        const query = 'SELECT * FROM external_warranties WHERE serial_number = $1';
        const result = await pool.query(query, [serialNumber]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Warranty not found for this serial number.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Internal server error while fetching warranty.' });
    }
});

// 7. USE CASE 3: Cross-System Identity Verification (POST)
// Agentforce calls this to verify the user before sharing sensitive data
app.post('/api/verify-user', async (req, res) => {
    try {
        // We expect Salesforce to send a JSON body with these two fields
        const { externalAccountId, email } = req.body;

        // Basic validation
        if (!externalAccountId || !email) {
            return res.status(400).json({ error: 'Missing required fields: externalAccountId or email.' });
        }

        // Check if the external ID and email match in the Postgres database
        const query = 'SELECT customer_external_id, full_name, email, account_status FROM external_customers WHERE customer_external_id = $1 AND email = $2';
        const result = await pool.query(query, [externalAccountId, email]);

        if (result.rows.length === 0) {
            // 401 Unauthorized if it doesn't match
            return res.status(401).json({ verified: false, message: 'Identity verification failed. No match found in external system.' });
        }

        // Return success and safe customer data back to Agentforce
        res.json({
            verified: true,
            customer: result.rows[0]
        });

    } catch (err) {
        console.error('Database error during verification:', err);
        res.status(500).json({ error: 'Internal server error during user verification.' });
    }
});

// 8. USE CASE 2: Dynamic Repair Quoting (GET)
// Agentforce calls this to get the real-time price of a replacement part
app.get('/api/quote/:partId', async (req, res) => {
    try {
        const { partId } = req.params;

        // Fetch the part details and current market price
        const query = 'SELECT part_id, part_name, base_price, stock_quantity, compatibility_notes FROM parts_pricing WHERE part_id = $1';
        const result = await pool.query(query, [partId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Part not found in inventory.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Database error fetching quote:', err);
        res.status(500).json({ error: 'Internal server error while fetching repair quote.' });
    }
});

module.exports = app;

// 6. Start the Server
//app.listen(port, () => {
    //console.log(`🚀 QuantumLink API is live on http://localhost:${port}`);
//});