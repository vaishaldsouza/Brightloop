import http from "http";

function get(path: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

async function testEndpoints() {
  console.log("==========================================================");
  console.log("🌐 BATCH 3.1 – Real HTTP Browser & Endpoint Verification");
  console.log("==========================================================");

  // 1. Home page /
  const home = await get("/");
  console.log(`[HTTP 1] GET / -> Status: ${home.statusCode}`);
  if (home.statusCode === 200 && home.body.includes("Brightloop")) {
    console.log("✅ PASS: Home page loads with status 200 and Brightloop brand");
  } else {
    console.error("❌ FAIL: Home page response unexpected");
  }

  // 2. Login page /login
  const login = await get("/login");
  console.log(`[HTTP 2] GET /login -> Status: ${login.statusCode}, Location: ${login.headers.location}, Length: ${login.body.length}`);
  if (login.statusCode === 200) {
    console.log("✅ PASS: Login page loads with status 200");
  } else {
    console.error("❌ FAIL: Login page response unexpected");
  }

  // 3. Unauthenticated /dashboard
  const dash = await get("/dashboard");
  console.log(`[HTTP 3] GET /dashboard (unauthenticated) -> Status: ${dash.statusCode}, Location: ${dash.headers.location}`);
  if (dash.statusCode === 307 && dash.headers.location?.includes("/login")) {
    console.log("✅ PASS: Protected /dashboard strictly redirects unauthenticated visitor to /login with callbackUrl");
  } else {
    console.error("❌ FAIL: /dashboard did not redirect to /login");
  }

  // 4. Unauthenticated Admin-only route /discounts
  const discounts = await get("/discounts");
  console.log(`[HTTP 4] GET /discounts (unauthenticated) -> Status: ${discounts.statusCode}, Location: ${discounts.headers.location}`);
  if (discounts.statusCode === 307 && discounts.headers.location?.includes("/login")) {
    console.log("✅ PASS: Admin-only /discounts strictly redirects unauthenticated visitor to /login");
  } else {
    console.error("❌ FAIL: /discounts did not redirect to /login");
  }

  // 5. Unauthenticated Staff-restricted route /staff
  const staff = await get("/staff");
  console.log(`[HTTP 5] GET /staff (unauthenticated) -> Status: ${staff.statusCode}, Location: ${staff.headers.location}`);
  if (staff.statusCode === 307 && staff.headers.location?.includes("/login")) {
    console.log("✅ PASS: Admin-only /staff strictly redirects unauthenticated visitor to /login");
  } else {
    console.error("❌ FAIL: /staff did not redirect to /login");
  }
}

testEndpoints().catch((err) => {
  console.error("HTTP test failed:", err);
  process.exit(1);
});
