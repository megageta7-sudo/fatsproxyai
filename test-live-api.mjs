async function testLiveApi() {
  const baseUrl = "https://fatsproxyai.vercel.app";
  console.log(`\nTesting API endpoints on: ${baseUrl}\n` + "=".repeat(50));

  const endpoints = [
    { name: "Root Landing Page", url: `${baseUrl}/`, method: "GET" },
    { name: "Admin Dashboard Page", url: `${baseUrl}/admin`, method: "GET" },
    { name: "Public Logs API", url: `${baseUrl}/api/logs?limit=3`, method: "GET" },
    { name: "Admin Config API (Tanpa Token)", url: `${baseUrl}/api/admin/config`, method: "GET" },
    { name: "Generate API (Tanpa Bearer Token)", url: `${baseUrl}/api/generate`, method: "POST", body: {} },
    { name: "Subscription Check Flow (Sample)", url: `${baseUrl}/api/subscription`, method: "POST", body: { action: "check-flow-license", email: "test@example.com" } }
  ];

  for (const ep of endpoints) {
    try {
      const startTime = Date.now();
      const options = {
        method: ep.method,
        headers: { "Content-Type": "application/json" }
      };
      if (ep.body) options.body = JSON.stringify(ep.body);

      const res = await fetch(ep.url, options);
      const text = await res.text();
      const duration = Date.now() - startTime;

      console.log(`\n[${res.status} ${res.statusText}] ${ep.name} (${duration}ms)`);
      console.log(`URL: ${ep.method} ${ep.url}`);
      
      let preview = text;
      try {
        const json = JSON.parse(text);
        preview = JSON.stringify(json, null, 2);
      } catch {
        preview = text.slice(0, 150) + (text.length > 150 ? "..." : "");
      }
      console.log("Response Preview:\n" + preview);
    } catch (err) {
      console.error(`\n[ERROR] ${ep.name}: ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(50) + "\nLive API testing completed.");
}

testLiveApi();
