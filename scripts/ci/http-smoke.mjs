#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL;
const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
const adminMfaCode = process.env.SMOKE_ADMIN_MFA_CODE;

if (!baseUrl) throw new Error("SMOKE_BASE_URL is required.");

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return response;
}

function cookieHeader(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return "";
  return raw.split(/,(?=[^;,]+=)/).map((cookie) => cookie.split(";")[0]).join("; ");
}

async function expectOk(label, response) {
  if (!response.ok) throw new Error(`${label}: expected 2xx, got ${response.status}`);
}

await expectOk("homepage", await request("/"));
await expectOk("health", await request("/api/health"));

if (!adminEmail || !adminPassword) {
  console.log("Authenticated smoke skipped: SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD not configured.");
  process.exit(0);
}

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: adminEmail, password: adminPassword, code: adminMfaCode || undefined }),
});
await expectOk("admin login", login);
const cookie = cookieHeader(login);
if (!cookie) throw new Error("admin login did not return a session cookie.");

const authed = { Cookie: cookie };
await expectOk("dashboard", await request("/dashboard", { headers: authed }));

const localSearch = await request("/api/admin/foods/search?q=arroz&limit=5", { headers: authed });
await expectOk("TACO search", localSearch);
const localBody = await localSearch.json();
if (!Array.isArray(localBody.items) || !localBody.items.some((item) => item.ref?.source === "TACO")) {
  throw new Error("TACO search did not return TACO-prioritized results.");
}

const usdaSearch = await request("/api/admin/foods/search?q=rice&source=USDA&limit=5", { headers: authed });
await expectOk("USDA search", usdaSearch);
const usdaBody = await usdaSearch.json();
if (!Array.isArray(usdaBody.items) || !usdaBody.items.some((item) => item.ref?.source === "USDA")) {
  throw new Error("USDA explicit search did not return USDA results.");
}

console.log(JSON.stringify({
  ok: true,
  tacoResults: localBody.items.length,
  usdaResults: usdaBody.items.length,
  firstUsda: usdaBody.items[0]?.ref ?? null,
}, null, 2));
