import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.DEMO_PORT || 4000);

interface DemoState {
  masalaChaiPrice: number;
  previousPrice: number;
  lastUpdatedAt: string | null;
  require2FA: boolean;
  is2FAVerified: boolean;
  expectedOtp: string;
  issues: Array<{
    id: string;
    title: string;
    severity: string;
    steps: string;
    status: string;
    createdAt: string;
  }>;
}

const state: DemoState = {
  masalaChaiPrice: 229,
  previousPrice: 229,
  lastUpdatedAt: null,
  require2FA: false,
  is2FAVerified: true,
  expectedOtp: '482910',
  issues: [
    {
      id: 'CHAI-103',
      title: 'Mobile header misaligned on 375px viewport',
      severity: 'LOW',
      steps: 'Open /shop on mobile width',
      status: 'OPEN',
      createdAt: '2026-11-04 14:20 IST'
    }
  ]
};

const commonStyles = `
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; background: #0f172a; color: #f8fafc; }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 28px; background: #1e293b; border-bottom: 1px solid #334155; }
  .brand { font-size: 20px; font-weight: 800; color: #f59e0b; letter-spacing: -0.3px; }
  .nav a { color: #cbd5e1; text-decoration: none; margin-left: 20px; font-weight: 600; font-size: 14px; padding: 6px 12px; border-radius: 6px; }
  .nav a.active, .nav a:hover { background: #334155; color: #fff; }
  .container { max-width: 1120px; margin: 28px auto; padding: 0 24px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 22px; margin-bottom: 20px; }
  .btn { cursor: pointer; border: none; border-radius: 8px; padding: 11px 18px; font-size: 14px; font-weight: 700; transition: 0.15s; }
  .btn-primary { background: #f59e0b; color: #0f172a; }
  .btn-danger { background: #ef4444; color: #ffffff; }
  .btn-success { background: #10b981; color: #052e16; }
  input, select, textarea { background: #0f172a; color: #f8fafc; border: 1px solid #475569; border-radius: 8px; padding: 10px 14px; font-size: 15px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge-staging { background: #3b82f633; color: #60a5fa; border: 1px solid #3b82f6; }
  .error-banner { background: #450a0a; border: 2px solid #ef4444; color: #fecaca; padding: 20px; border-radius: 12px; margin-top: 18px; }
  .success-banner { background: #064e3b; border: 2px solid #10b981; color: #a7f3d0; padding: 18px; border-radius: 12px; margin-bottom: 18px; }
`;

function renderShopPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Chai Co. — Staging Storefront</title>
  <style>${commonStyles}
    .grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 24px; }
    .product-row { display: flex; justify-content: space-between; align-items: center; padding: 16px; border: 1px solid #334155; border-radius: 10px; margin-bottom: 12px; background: #0f172a; }
    .price { font-size: 22px; font-weight: 800; color: #fbbf24; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">☕ Chai Co. Storefront <span class="badge badge-staging">STAGING ENV</span></div>
    <div class="nav">
      <a href="/shop" class="active">Staging Shop</a>
      <a href="/admin">Store Admin</a>
      <a href="/issues">Issue Tracker</a>
    </div>
  </div>
  <div class="container">
    <div class="grid">
      <div class="card">
        <h2 style="margin-top:0">Signature Blends</h2>
        <div class="product-row" id="product-masala-chai">
          <div>
            <div style="font-size:18px;font-weight:700">Masala Chai Tin (250g)</div>
            <div style="color:#94a3b8;font-size:13px">Spiced Assam black tea with crushed green cardamom & ginger</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <span class="price" id="display-masala-price">₹${state.masalaChaiPrice}</span>
            <button class="btn btn-primary" id="add-masala-chai-btn" onclick="addToCart()">Add to Cart</button>
          </div>
        </div>
        <div class="product-row">
          <div>
            <div style="font-size:18px;font-weight:700">Cardamom Morning Brew (200g)</div>
            <div style="color:#94a3b8;font-size:13px">Single-estate Nilgiri aromatic blend</div>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <span class="price">₹199</span>
            <button class="btn btn-primary">Add to Cart</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">Order Summary</h2>
        <div id="cart-status" style="padding:12px;background:#0f172a;border-radius:8px;margin-bottom:16px;color:#cbd5e1">
          Cart is empty. Click "Add to Cart" to begin.
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Promo / Coupon Code</label>
          <div style="display:flex;gap:8px">
            <input id="coupon-input" type="text" placeholder="Try CHAI50" style="flex:1" />
            <button class="btn btn-primary" id="apply-coupon-btn" onclick="applyCoupon()">Apply Coupon</button>
          </div>
          <div id="coupon-feedback" style="font-size:13px;color:#38bdf8;margin-top:8px"></div>
        </div>
        <button class="btn btn-success" id="checkout-btn" style="width:100%;font-size:16px;padding:14px" onclick="checkout()">
          Proceed to Checkout
        </button>

        <div id="checkout-error-box" style="display:none" class="error-banner">
          <div style="font-size:17px;font-weight:800;color:#f87171;margin-bottom:6px">
            🚨 500 Internal Server Error — Checkout Failed
          </div>
          <code style="font-size:13px;display:block;background:#1f0909;padding:10px;border-radius:6px;color:#fca5a5">
            CouponDiscountOverflowException: Negative tax bucket when applying coupon 'CHAI50' on item SKU-MASALA-250 (at CheckoutController.ts:142:19)
          </code>
        </div>
      </div>
    </div>
  </div>

  <script>
    let hasItem = false;
    let appliedCoupon = '';
    const price = ${state.masalaChaiPrice};

    function addToCart() {
      hasItem = true;
      document.getElementById('cart-status').innerHTML =
        '<strong>1x Masala Chai Tin (250g)</strong> — Subtotal: <strong>₹' + price + '</strong>';
    }

    function applyCoupon() {
      const val = document.getElementById('coupon-input').value.trim().toUpperCase();
      appliedCoupon = val;
      document.getElementById('coupon-feedback').textContent =
        val ? 'Coupon "' + val + '" staged for checkout calculation.' : '';
    }

    function checkout() {
      if (appliedCoupon === 'CHAI50') {
        document.getElementById('checkout-error-box').style.display = 'block';
      } else {
        alert('Checkout succeeded (no coupon bug triggered).');
      }
    }
  </script>
</body>
</html>`;
}

function renderAdminPage(savedBanner: boolean, otpError: boolean): string {
  if (state.require2FA && !state.is2FAVerified) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Chai Co. Admin — 2FA Security Gate</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">🔐 Chai Co. Store Admin — Security Challenge</div>
    <div class="nav">
      <a href="/shop">Staging Shop</a>
      <a href="/admin" class="active">Store Admin</a>
      <a href="/issues">Issue Tracker</a>
    </div>
  </div>
  <div class="container" style="max-width:520px;margin-top:60px">
    <div class="card" style="border:2px solid #f59e0b">
      <h2 style="margin-top:0;color:#fbbf24">Two-Factor Login Code Required</h2>
      <p style="color:#cbd5e1;line-height:1.5">
        This admin session requires a 6-digit operator verification code sent to the team authenticator device.
        <br/><span style="color:#94a3b8;font-size:13px">(Demo Hint for Rahul's Takeover: code is <strong>${state.expectedOtp}</strong>)</span>
      </p>
      ${otpError ? `<div class="error-banner" style="margin-bottom:14px">Invalid 6-digit verification code.</div>` : ''}
      <form method="POST" action="/admin/verify-2fa">
        <label style="display:block;margin-bottom:8px;font-weight:700">6-Digit Authenticator Code</label>
        <input id="otp-input" name="otp" type="text" maxlength="6" placeholder="482910" style="width:100%;font-size:24px;letter-spacing:6px;text-align:center;margin-bottom:16px" required />
        <button id="verify-otp-btn" class="btn btn-primary" type="submit" style="width:100%;font-size:16px">
          Verify & Unlock Store Admin
        </button>
      </form>
    </div>
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Chai Co. — Store Admin Portal</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">🛠️ Chai Co. Store Admin Portal</div>
    <div class="nav">
      <a href="/shop">Staging Shop</a>
      <a href="/admin" class="active">Store Admin</a>
      <a href="/issues">Issue Tracker</a>
    </div>
  </div>
  <div class="container">
    ${
      savedBanner
        ? `<div class="success-banner" id="admin-save-banner">
            ✅ <strong>Price Updated Live:</strong> Masala Chai Tin (250g) changed from <strong>₹${state.previousPrice}</strong> to <strong>₹${state.masalaChaiPrice}</strong> (${state.lastUpdatedAt}).
          </div>`
        : ''
    }
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <h2 style="margin:0">Product Catalog & Pricing Control</h2>
        <form method="POST" action="/admin/toggle-2fa" style="margin:0">
          <button type="submit" class="btn" style="background:#334155;color:#e2e8f0;font-size:12px">
            ${state.require2FA ? '🔓 Disable 2FA Gate' : '🔒 Arm 2FA Gate for Takeover Demo'}
          </button>
        </form>
      </div>

      <form method="POST" action="/admin/update-price">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid #334155;text-align:left;color:#94a3b8;font-size:13px">
              <th style="padding:12px">SKU</th>
              <th style="padding:12px">Product Name</th>
              <th style="padding:12px">Current Live Price</th>
              <th style="padding:12px">New Price (INR ₹)</th>
              <th style="padding:12px">Action (High-Risk)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #334155">
              <td style="padding:14px"><code>SKU-MASALA-250</code></td>
              <td style="padding:14px;font-weight:700">Masala Chai Tin (250g)</td>
              <td style="padding:14px;font-size:18px;color:#fbbf24;font-weight:800" id="current-price-cell">₹${state.masalaChaiPrice}</td>
              <td style="padding:14px">
                <input id="price-masala-chai" name="newPrice" type="number" value="${state.masalaChaiPrice}" style="width:140px;font-weight:700;font-size:17px" />
              </td>
              <td style="padding:14px">
                <button id="save-price-btn" type="submit" class="btn btn-danger">
                  Save Price Update
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  </div>
</body>
</html>`;
}

function renderIssuesPage(createdId: string | null): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]!));
  const rows = state.issues
    .map(
      (iss) => `
      <tr data-issue-id="${iss.id}" style="border-bottom:1px solid #334155">
        <td style="padding:12px;font-weight:800;color:#38bdf8"><a href="/issues/${iss.id}">#${iss.id}</a></td>
        <td style="padding:12px;font-weight:700">${escape(iss.title)}</td>
        <td style="padding:12px"><span class="badge" style="background:#ef444433;color:#fca5a5">${iss.severity}</span></td>
        <td style="padding:12px;color:#94a3b8;font-size:13px">${escape(iss.steps)}</td>
        <td style="padding:12px;color:#10b981;font-weight:700">${iss.status}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Chai Co. — QA Issue Tracker</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">🐞 Chai Co. Engineering Issue Tracker</div>
    <div class="nav">
      <a href="/shop">Staging Shop</a>
      <a href="/admin">Store Admin</a>
      <a href="/issues" class="active">Issue Tracker</a>
    </div>
  </div>
  <div class="container">
    ${
      createdId
        ? `<div class="success-banner" id="issue-filed-banner">
            ✅ <strong>Bug Report Filed:</strong> Issue <strong>#${createdId}</strong> created and assigned to Checkout Squad.
          </div>`
        : ''
    }
    <div class="card">
      <h2 style="margin-top:0">File New QA Bug Report</h2>
      <form method="POST" action="/issues/create" style="display:grid;gap:14px">
        <div>
          <label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Issue Title</label>
          <input id="issue-title" name="title" type="text" placeholder="e.g. 500 CouponDiscountOverflowException on checkout with CHAI50" style="width:100%" required />
        </div>
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:14px">
          <div>
            <label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Severity</label>
            <select id="issue-severity" name="severity" style="width:100%">
              <option value="CRITICAL">CRITICAL (Blocks Checkout)</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:13px;color:#94a3b8;margin-bottom:6px">Steps to Reproduce</label>
            <input id="issue-steps" name="steps" type="text" placeholder="1. Add Masala Chai 2. Apply CHAI50 3. Click Checkout" style="width:100%" required />
          </div>
        </div>
        <div>
          <button id="submit-issue-btn" type="submit" class="btn btn-primary">Submit Bug Report</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Active Issues (${state.issues.length})</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #334155;text-align:left;color:#94a3b8;font-size:13px">
            <th style="padding:12px">ID</th>
            <th style="padding:12px">Title</th>
            <th style="padding:12px">Severity</th>
            <th style="padding:12px">Reproduction Steps</th>
            <th style="padding:12px">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function parseFormBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const out: Record<string, string> = {};
      params.forEach((v, k) => (out[k] = v));
      resolve(out);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/api/demo-state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  if (url.pathname === '/api/demo-reset' && req.method === 'POST') {
    state.masalaChaiPrice = 229;
    state.previousPrice = 229;
    state.require2FA = false;
    state.is2FAVerified = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, state }));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/shop') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderShopPage());
    return;
  }

  if (url.pathname === '/admin' && req.method === 'GET') {
    if (url.searchParams.get('require2fa') === '1') {
      state.require2FA = true;
      state.is2FAVerified = false;
    }
    const saved = url.searchParams.get('saved') === '1';
    const otpErr = url.searchParams.get('otpError') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderAdminPage(saved, otpErr));
    return;
  }

  if (url.pathname === '/admin/toggle-2fa' && req.method === 'POST') {
    state.require2FA = !state.require2FA;
    state.is2FAVerified = !state.require2FA;
    res.writeHead(302, { Location: '/admin' });
    res.end();
    return;
  }

  if (url.pathname === '/admin/verify-2fa' && req.method === 'POST') {
    const form = await parseFormBody(req);
    if (form.otp?.trim() === state.expectedOtp) {
      state.is2FAVerified = true;
      res.writeHead(302, { Location: '/admin' });
    } else {
      res.writeHead(302, { Location: '/admin?otpError=1' });
    }
    res.end();
    return;
  }

  if (url.pathname === '/admin/update-price' && req.method === 'POST') {
    const form = await parseFormBody(req);
    const parsed = Number(form.newPrice);
    if (!Number.isNaN(parsed) && parsed > 0) {
      state.previousPrice = state.masalaChaiPrice;
      state.masalaChaiPrice = parsed;
      state.lastUpdatedAt = new Date().toLocaleTimeString('en-IN', { hour12: false });
    }
    res.writeHead(302, { Location: '/admin?saved=1' });
    res.end();
    return;
  }

  if (/^\/issues\/CHAI-\d+$/.test(url.pathname) && req.method === 'GET') {
    const issue = state.issues.find(item => item.id === url.pathname.split('/').pop());
    if (!issue) { res.writeHead(404); res.end('Issue not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]!));
    res.end(`<html><head><title>${issue.id}</title></head><body><h1>${escape(issue.id)}: ${escape(issue.title)}</h1><p>${escape(issue.severity)} · ${escape(issue.status)}</p><pre>${escape(issue.steps)}</pre><a href="/issues">All issues</a></body></html>`);
    return;
  }

  if (url.pathname === '/issues' && req.method === 'GET') {
    const created = url.searchParams.get('created');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderIssuesPage(created));
    return;
  }

  if (url.pathname === '/issues/create' && req.method === 'POST') {
    const form = await parseFormBody(req);
    const nextNum = 103 + state.issues.length;
    const id = `CHAI-${nextNum}`;
    state.issues.unshift({
      id,
      title: form.title || 'Checkout 500 Coupon Bug',
      severity: form.severity || 'CRITICAL',
      steps: form.steps || 'Add Masala Chai -> Apply CHAI50 -> Checkout',
      status: 'OPEN',
      createdAt: new Date().toLocaleTimeString('en-IN', { hour12: false })
    });
    res.writeHead(302, { Location: `/issues?created=${id}` });
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[Chai Co. Demo Suite] Running at http://localhost:${PORT}`);
  console.log(`  • Staging Shop:  http://localhost:${PORT}/shop`);
  console.log(`  • Store Admin:   http://localhost:${PORT}/admin`);
  console.log(`  • Issue Tracker: http://localhost:${PORT}/issues`);
});

