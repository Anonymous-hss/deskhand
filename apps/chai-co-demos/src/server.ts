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
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap');
  :root { color-scheme:light; --paper:#f7f5ef; --surface:#fffefa; --ink:#25372f; --muted:#68766d; --line:#e3e5db; --leaf:#285847; --leaf-dark:#1c4436; --tea:#a94f31; --wash:#edf1e8; --shadow:0 18px 45px rgba(39,57,45,.07); }
  * { box-sizing:border-box; } body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 'DM Sans',sans-serif; }
  a { color:var(--leaf); } .topbar { min-height:74px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:12px clamp(20px,5vw,76px); background:#fbfaf6; border-bottom:1px solid var(--line); }
  .brand { font:600 22px/1.2 'Playfair Display',Georgia,serif; color:var(--leaf-dark); letter-spacing:-.4px; } .nav { display:flex; align-items:center; gap:7px; }
  .nav a { color:var(--muted); text-decoration:none; margin:0; font-weight:600; font-size:13px; padding:9px 13px; border-radius:6px; } .nav a.active,.nav a:hover { background:var(--wash); color:var(--leaf-dark); }
  .container { width:min(1160px,100% - 40px); margin:clamp(28px,5vw,64px) auto; } .card { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:clamp(20px,3vw,32px); margin-bottom:22px; box-shadow:var(--shadow); }
  h1,h2,h3 { color:var(--leaf-dark); } h1 { font:600 clamp(34px,5vw,58px)/1.08 'Playfair Display',Georgia,serif; letter-spacing:-1.3px; margin:8px 0 14px; } h2 { font:600 25px/1.2 'Playfair Display',Georgia,serif; margin:0 0 20px; }
  .eyebrow { color:var(--tea); text-transform:uppercase; letter-spacing:1.5px; font-size:11px; font-weight:700; } .lede { max-width:600px; color:var(--muted); font-size:16px; }
  .btn { cursor:pointer; border:1px solid transparent; border-radius:6px; padding:11px 17px; font:700 13px 'DM Sans',sans-serif; transition:background .18s,transform .18s; } .btn:hover { transform:translateY(-1px); }
  .btn:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible { outline:3px solid #ba8a56; outline-offset:2px; } .btn-primary,.btn-success { background:var(--leaf); color:#fff; } .btn-primary:hover,.btn-success:hover { background:var(--leaf-dark); } .btn-danger { background:var(--tea); color:#fff; }
  input,select,textarea { background:#fffefa; color:var(--ink); border:1px solid #cdd4c9; border-radius:6px; padding:11px 13px; font:14px 'DM Sans',sans-serif; } input::placeholder,textarea::placeholder { color:#89958b; } label { color:#43554a; font-weight:600; }
  .badge { display:inline-block; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; } .badge-staging { background:#eef0e7; color:#647163; border:1px solid #dce1d6; }
  .error-banner { background:#fff2ed; border:1px solid #e7b6a5; color:#793b27; padding:19px; border-radius:8px; margin-top:18px; } .success-banner { background:#edf4eb; border:1px solid #bfd0bb; color:#244b36; padding:17px 19px; border-radius:8px; margin-bottom:20px; }
  .page-intro { margin-bottom:30px; } .table-wrap { overflow-x:auto; } table { width:100%; border-collapse:collapse; min-width:700px; } th { text-align:left; color:var(--muted); font-size:11px; letter-spacing:.08em; text-transform:uppercase; padding:13px 14px; border-bottom:1px solid var(--line); } td { padding:15px 14px; border-bottom:1px solid var(--line); vertical-align:top; } tr:last-child td { border-bottom:0; } .helper { color:var(--muted); font-size:13px; }
  @media(max-width:760px) { .topbar { align-items:flex-start; flex-direction:column; padding:16px 20px 12px; gap:10px; } .nav { width:100%; overflow:auto; } .nav a { white-space:nowrap; padding:8px 10px; } .container { width:min(100% - 28px,1160px); margin:28px auto; } }
  @media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; transition:none!important; } }
`;

function renderShopPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chai Co. — Tea worth slowing down for</title>
  <style>${commonStyles}
    .shop-hero { padding:clamp(26px,6vw,68px); margin-bottom:25px; border-radius:10px; background:#e8ede2; position:relative; overflow:hidden; }
    .shop-hero:after { content:''; position:absolute; width:250px;height:250px;border:1px solid #cad6c5;border-radius:50%;right:8%;top:15%;box-shadow:0 0 0 24px #e8ede288,0 0 0 48px #e8ede255; }
    .shop-hero > * { position:relative;z-index:1; } .grid { display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.85fr);gap:24px;align-items:start; }
    .product-row { display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 0;border-bottom:1px solid var(--line); } .product-row:last-child { border-bottom:0; }
    .product-name { font-size:17px;font-weight:700;color:var(--ink); } .product-description { color:var(--muted);font-size:13px;margin-top:3px; } .product-action { display:flex;align-items:center;gap:17px;white-space:nowrap; }
    .price { font:600 24px 'Playfair Display',Georgia,serif;color:var(--leaf-dark); } .summary { position:sticky;top:20px; } .cart-status { padding:15px;background:#f1f3ec;border-radius:6px;margin-bottom:22px;color:#536157; }
    .trust-strip { display:flex;justify-content:center;gap:clamp(20px,5vw,64px);padding:18px 12px;margin:0 0 26px;border-block:1px solid var(--line);color:var(--muted);font-size:12px;flex-wrap:wrap; }
    .product-image { display:grid;place-items:center;width:82px;height:82px;flex:none;border-radius:50%;background:#e7eadf;color:#385b44;font:600 12px 'Playfair Display',Georgia,serif;letter-spacing:1px; }
    .product-copy { display:flex;align-items:center;gap:18px; }
    .quantity-line { display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0;color:var(--muted);font-size:13px; }
    .quantity-controls { display:flex;align-items:center;gap:10px; }
    .quantity-controls button { width:30px;height:30px;border:1px solid var(--line);border-radius:50%;background:var(--surface);color:var(--leaf);font-size:17px;cursor:pointer; }
    .summary-row { display:flex;justify-content:space-between;gap:12px;padding:8px 0;color:var(--muted);font-size:13px; }
    .summary-total { display:flex;justify-content:space-between;padding:14px 0;margin:8px 0 16px;border-top:1px solid var(--line);font-weight:700;color:var(--ink); }
    .btn:disabled { cursor:not-allowed;opacity:.5;transform:none; }
    .notice { padding:14px 16px;border-radius:6px;background:#fff4eb;color:#754728;font-size:13px; }
    @media(max-width:760px) { .grid { grid-template-columns:1fr; } .summary { position:static; } .product-row { align-items:flex-start;flex-direction:column; } .product-action { width:100%;justify-content:space-between; } .shop-hero:after { right:-14%;top:32%; } .product-copy { align-items:flex-start; } }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="brand">Chai Co. <span class="badge badge-staging">DEMO STORE</span></div>
    <nav class="nav" aria-label="Main navigation">
      <a href="/shop" class="active">Shop</a>
      <a href="/admin">Store admin</a>
      <a href="/issues">Issues</a>
    </nav>
  </div>
  <main class="container">
    <header class="shop-hero"><div class="eyebrow">Small-batch tea · Made with care</div><h1>Tea worth slowing down for.</h1><p class="lede">Thoughtful blends, whole spices, and a little more calm in your everyday cup.</p></header>
    <div class="trust-strip" aria-label="Store policies"><span>Small-batch blended in India</span><span>Secure checkout</span><span>Free delivery over ₹499</span></div>
    <div class="grid">
      <section class="card" aria-labelledby="blends-heading">
        <div class="eyebrow">From our tea room</div><h2>Signature blends</h2>
        <div class="product-row" id="product-masala-chai">
          <div class="product-copy">
            <div class="product-image" role="img" aria-label="Illustration of a tea tin">ASSAM<br/>No. 01</div>
            <div><div class="product-name">Masala Chai Tin <span class="helper">· 250 g</span></div>
            <div class="product-description">Bold Assam black tea with green cardamom and warming ginger.</div></div>
          </div>
          <div class="product-action">
            <span class="price" id="display-masala-price">₹${state.masalaChaiPrice}</span>
            <button class="btn btn-primary" id="add-masala-chai-btn" onclick="addToCart('masala')">Add to basket</button>
          </div>
        </div>
        <div class="product-row">
          <div class="product-copy">
            <div class="product-image" role="img" aria-label="Illustration of a tea tin">NILGIRI<br/>No. 02</div>
            <div><div class="product-name">Cardamom Morning Brew <span class="helper">· 200 g</span></div>
            <div class="product-description">A fragrant, single-estate Nilgiri blend for brighter mornings.</div></div>
          </div>
          <div class="product-action">
            <span class="price">₹199</span>
            <button class="btn btn-primary" onclick="addToCart('cardamom')">Add to basket</button>
          </div>
        </div>
      </section>

      <aside class="card summary" aria-labelledby="basket-heading">
        <div class="eyebrow">Your order</div><h2 id="basket-heading">Basket <span id="basket-count" class="badge badge-staging">0 items</span></h2>
        <div id="cart-status" class="cart-status" aria-live="polite">
          Your basket is empty. Add a blend to get started.
        </div>
        <div id="basket-lines"></div>
        <div class="summary-row"><span>Delivery</span><span id="delivery-cost">—</span></div>
        <div class="summary-total"><span>Subtotal</span><span id="basket-subtotal">₹0</span></div>
        <div style="margin-bottom:16px">
          <label for="coupon-input" style="display:block;font-size:13px;margin-bottom:6px">Discount code</label>
          <div style="display:flex;gap:8px">
            <input id="coupon-input" type="text" placeholder="Enter code" style="flex:1;min-width:0" autocomplete="off" />
            <button class="btn btn-primary" id="apply-coupon-btn" onclick="applyCoupon()">Apply</button>
          </div>
          <div id="coupon-feedback" class="helper" style="margin-top:8px" aria-live="polite"></div>
        </div>
        <button class="btn btn-success" id="checkout-btn" style="width:100%;font-size:16px;padding:14px" onclick="checkout()" disabled>
          Continue to checkout
        </button>
        <p class="helper" style="text-align:center;margin-bottom:0">Shipping and taxes are calculated at checkout.</p>

        <div id="checkout-error-box" style="display:none" class="error-banner" role="alert">
          <div style="font-size:17px;font-weight:800;margin-bottom:6px">
            We couldn’t apply this discount
          </div>
          <p style="margin:0 0 8px">The checkout service returned error 500. Your basket is safe. Remove the code and try again.</p>
          <details><summary>Technical details</summary><code style="font-size:12px;display:block;background:#f8e4dc;padding:10px;border-radius:6px;margin-top:8px">
            CouponDiscountOverflowException: Negative tax bucket when applying coupon 'CHAI50' on item SKU-MASALA-250 (at CheckoutController.ts:142:19)
          </code></details>
        </div>
        <div id="checkout-success-box" style="display:none" class="success-banner" role="status">Your order is ready for secure payment.</div>
      </aside>
    </div>
  </main>

  <script>
    let appliedCoupon = '';
    const prices = { masala: ${state.masalaChaiPrice}, cardamom: 199 };
    const products = { masala: 'Masala Chai Tin (250 g)', cardamom: 'Cardamom Morning Brew (200 g)' };
    const basket = { masala: 0, cardamom: 0 };

    function renderBasket() {
      const count = basket.masala + basket.cardamom;
      const subtotal = basket.masala * prices.masala + basket.cardamom * prices.cardamom;
      document.getElementById('cart-status').hidden = count > 0;
      document.getElementById('basket-count').textContent = count + (count === 1 ? ' item' : ' items');
      document.getElementById('basket-subtotal').textContent = '₹' + subtotal;
      document.getElementById('delivery-cost').textContent = count ? (subtotal >= 499 ? 'Free' : '₹40') : '—';
      document.getElementById('checkout-btn').disabled = count === 0;
      document.getElementById('basket-lines').innerHTML = Object.keys(basket).filter(key => basket[key] > 0).map(key =>
        '<div class="quantity-line"><span>' + products[key] + '</span><span class="quantity-controls"><button type="button" aria-label="Remove one ' + products[key] + '" data-product="' + key + '" onclick="changeQuantity(this.dataset.product,-1)">−</button><strong>' + basket[key] + '</strong><button type="button" aria-label="Add one ' + products[key] + '" data-product="' + key + '" onclick="changeQuantity(this.dataset.product,1)">+</button></span></div>'
      ).join('');
    }
    function addToCart(product) { basket[product] += 1; renderBasket(); }
    function changeQuantity(product, amount) { basket[product] = Math.max(0, basket[product] + amount); renderBasket(); }

    function applyCoupon() {
      const val = document.getElementById('coupon-input').value.trim().toUpperCase();
      appliedCoupon = val;
      const feedback = document.getElementById('coupon-feedback');
      if (val === 'CHAI50') feedback.textContent = 'Code accepted. The discount will be checked at checkout.';
      else if (val) { appliedCoupon = ''; feedback.textContent = 'We couldn’t find that code. Check it and try again.'; }
      else { appliedCoupon = ''; feedback.textContent = 'Enter a discount code first.'; }
    }

    function checkout() {
      if (Object.values(basket).every(quantity => quantity === 0)) return;
      if (appliedCoupon === 'CHAI50') {
        document.getElementById('checkout-error-box').style.display = 'block';
        document.getElementById('checkout-success-box').style.display = 'none';
      } else {
        document.getElementById('checkout-success-box').style.display = 'block';
        document.getElementById('checkout-error-box').style.display = 'none';
      }
    }
    renderBasket();
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chai Co. — Verify store admin</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">Chai Co. <span class="badge badge-staging">STORE ADMIN</span></div>
    <div class="nav">
      <a href="/shop">Shop</a>
      <a href="/admin" class="active">Store admin</a>
      <a href="/issues">Issues</a>
    </div>
  </div>
  <div class="container" style="max-width:520px;margin-top:60px">
    <div class="card" style="border:2px solid #f59e0b">
      <div class="eyebrow">Secure approval</div><h2>Verify it’s you</h2>
      <p style="color:#cbd5e1;line-height:1.5">
        Enter the six-digit demo code to unlock store pricing controls.
        <br/><span class="helper">Demo code: <strong>${state.expectedOtp}</strong></span>
      </p>
      ${otpError ? `<div class="error-banner" style="margin-bottom:14px">Invalid 6-digit verification code.</div>` : ''}
      <form method="POST" action="/admin/verify-2fa">
        <label for="otp-input" style="display:block;margin-bottom:8px;font-weight:700">6-digit verification code</label>
        <input id="otp-input" name="otp" type="text" maxlength="6" placeholder="482910" style="width:100%;font-size:24px;letter-spacing:6px;text-align:center;margin-bottom:16px" required />
        <button id="verify-otp-btn" class="btn btn-primary" type="submit" style="width:100%;font-size:16px">
          Verify and continue
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chai Co. — Store admin</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">Chai Co. <span class="badge badge-staging">STORE ADMIN</span></div>
    <div class="nav">
      <a href="/shop">Shop</a>
      <a href="/admin" class="active">Store admin</a>
      <a href="/issues">Issues</a>
    </div>
  </div>
  <div class="container">
    ${
      savedBanner
        ? `<div class="success-banner" id="admin-save-banner" role="status">
            <strong>Price saved.</strong> Masala Chai Tin (250 g) changed from <strong>₹${state.previousPrice}</strong> to <strong>₹${state.masalaChaiPrice}</strong> at ${state.lastUpdatedAt}.
          </div>`
        : ''
    }
    <header class="page-intro"><div class="eyebrow">Store operations</div><h1>Pricing and products</h1><p class="lede">Review product prices and make a controlled update to your demo store.</p></header>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:18px;flex-wrap:wrap">
        <div><h2 style="margin:0">Product pricing</h2><span class="helper">Changes appear in the shop as soon as you save.</span></div>
        <form method="POST" action="/admin/toggle-2fa" style="margin:0">
          <button type="submit" class="btn" style="background:#334155;color:#e2e8f0;font-size:12px">
            ${state.require2FA ? 'Turn off verification' : 'Require verification'}
          </button>
        </form>
      </div>

      <form method="POST" action="/admin/update-price">
        <div class="table-wrap"><table>
          <thead>
            <tr style="border-bottom:1px solid #334155;text-align:left;color:#94a3b8;font-size:13px">
              <th>Product code</th><th>Product</th><th>Current price</th><th>New price (₹)</th><th>Save</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #334155">
              <td style="padding:14px"><code>MASALA-250</code></td>
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
        </table></div>
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
      <tr data-issue-id="${iss.id}">
        <td style="font-weight:700"><a href="/issues/${iss.id}">${iss.id}</a></td>
        <td style="font-weight:600">${escape(iss.title)}</td>
        <td><span class="badge" style="background:#f8e8df;color:#813d24">${iss.severity === 'CRITICAL' ? 'Critical' : iss.severity.charAt(0) + iss.severity.slice(1).toLowerCase()}</span></td>
        <td class="helper">${escape(iss.steps)}</td>
        <td style="color:var(--leaf);font-weight:700">${iss.status === 'OPEN' ? 'Open' : iss.status}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chai Co. — Issues</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">Chai Co. <span class="badge badge-staging">ISSUES</span></div>
    <div class="nav">
      <a href="/shop">Shop</a>
      <a href="/admin">Store admin</a>
      <a href="/issues" class="active">Issues</a>
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
    <header class="page-intro"><div class="eyebrow">Product quality</div><h1>Issues</h1><p class="lede">Report a problem with clear steps so the team can reproduce and resolve it.</p></header>
    <div class="card">
      <div class="eyebrow">New report</div><h2>Tell us what went wrong</h2>
      <form method="POST" action="/issues/create" style="display:grid;gap:14px">
        <div>
          <label for="issue-title" style="display:block;font-size:13px;margin-bottom:6px">Short description</label>
          <input id="issue-title" name="title" type="text" placeholder="e.g. 500 CouponDiscountOverflowException on checkout with CHAI50" style="width:100%" required />
        </div>
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:14px">
          <div>
            <label for="issue-severity" style="display:block;font-size:13px;margin-bottom:6px">How serious is it?</label>
            <select id="issue-severity" name="severity" style="width:100%">
              <option value="CRITICAL">Critical — customers can’t check out</option>
              <option value="HIGH">High — major feature is broken</option>
              <option value="MEDIUM">Medium — workaround is available</option>
            </select>
          </div>
          <div>
            <label for="issue-steps" style="display:block;font-size:13px;margin-bottom:6px">Steps to reproduce</label>
            <input id="issue-steps" name="steps" type="text" placeholder="1. Add Masala Chai 2. Apply CHAI50 3. Click Checkout" style="width:100%" required />
          </div>
        </div>
        <div>
          <button id="submit-issue-btn" type="submit" class="btn btn-primary">Create issue</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="eyebrow">Team queue</div><h2>Open issues <span class="badge badge-staging">${state.issues.length}</span></h2>
      <div class="table-wrap"><table>
        <thead>
          <tr style="border-bottom:1px solid #334155;text-align:left;color:#94a3b8;font-size:13px">
            <th>Issue</th><th>Description</th><th>Severity</th><th>How to reproduce</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
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

  if (url.pathname === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, app: 'chai-co-demo', port: PORT }));
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
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escape(issue.id)} — Chai Co.</title><style>${commonStyles}.issue-detail{max-width:760px}.issue-steps{white-space:pre-wrap;background:#f1f3ec;border-radius:6px;padding:18px;color:var(--ink);font:14px/1.6 'DM Sans',sans-serif}</style></head><body><div class="topbar"><div class="brand">Chai Co. <span class="badge badge-staging">ISSUES</span></div><nav class="nav"><a href="/shop">Shop</a><a href="/admin">Store admin</a><a href="/issues" class="active">Issues</a></nav></div><main class="container issue-detail"><a href="/issues" style="text-decoration:none">← All issues</a><div class="card" style="margin-top:22px"><div class="eyebrow">Issue ${escape(issue.id)}</div><h1>${escape(issue.title)}</h1><p><span class="badge" style="background:#f8e8df;color:#813d24">${escape(issue.severity)}</span> <span class="badge badge-staging">${escape(issue.status === 'OPEN' ? 'Open' : issue.status)}</span></p><h2 style="font-size:20px;margin-top:30px">How to reproduce</h2><pre class="issue-steps">${escape(issue.steps)}</pre></div></main></body></html>`);
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
    const title = String(form.title || 'Checkout 500 Coupon Bug').slice(0, 180);
    const steps = String(form.steps || 'Add Masala Chai -> Apply CHAI50 -> Checkout').slice(0, 600);
    const severity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(form.severity || '') ? form.severity! : 'MEDIUM';
    state.issues.unshift({
      id,
      title,
      severity,
      steps,
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

