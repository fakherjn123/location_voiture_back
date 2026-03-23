const fetch = require("node-fetch"); // or global fetch in Node 18+

async function testApi() {
  try {
    const res = await global.fetch("http://localhost:3000/api/cars");
    console.log("GET /api/cars status:", res.status);
    
    // Test a POST to rentals without auth to see if we get 401 or 500
    const res2 = await global.fetch("http://localhost:3000/api/rentals", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ car_id: 1, start_date: "2026-03-20", end_date: "2026-03-22" })
    });
    console.log("POST /api/rentals status:", res2.status);
    const text2 = await res2.text();
    console.log("POST /api/rentals body:", text2);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}
testApi();
