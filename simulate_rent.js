require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('./src/config/db');
const fetch = require('node-fetch') || global.fetch;

async function testPostRental() {
  try {
    const userRes = await pool.query("SELECT * FROM users LIMIT 1");
    if (userRes.rows.length === 0) {
      console.log("No users in db");
      process.exit();
    }
    const user = userRes.rows[0];
    
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    
    // On prend aussi une voiture
    const carRes = await pool.query("SELECT id FROM cars LIMIT 1");
    const car_id = carRes.rows.length ? carRes.rows[0].id : 1;

    console.log("Testing POST /api/rentals as user", user.id);
    
    const res = await fetch("http://localhost:3000/api/rentals", {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `token=${token}` // Some auth middlewares use cookies
      },
      body: JSON.stringify({ 
        car_id, 
        start_date: "2026-04-01", 
        end_date: "2026-04-05",
        // En envoyant delivery_requested à false implicitement car il manque
      })
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);

    // See if setting Bearer token is needed
    if (res.status === 401 || res.status === 403) {
      const res2 = await fetch("http://localhost:3000/api/rentals", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          car_id, 
          start_date: "2026-04-01", 
          end_date: "2026-04-05"
        })
      });
      console.log("With Bearer -> Status:", res2.status);
      console.log("With Bearer -> Body:", await res2.text());
    }

    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}
testPostRental();
