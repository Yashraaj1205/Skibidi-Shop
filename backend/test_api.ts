import admin from './src/config/firebase';
import fetch from 'node-fetch'; // Make sure this is installed or use native fetch if Node 18+

const API_KEY = "AIzaSyBmNkXx4iBGAuI-lVUXHedNsZMLHUW-qJs";
const BASE_URL = 'http://localhost:3000/api';

async function testAll() {
  console.log('--- STARTING END-TO-END API TEST ---');
  
  // 1. Mint a mock Firebase Auth Custom Token
  const uid = 'test_user_' + Date.now();
  const customToken = await admin.auth().createCustomToken(uid, {
    email: 'test@skibidishop.local',
    name: 'Skibidi Tester',
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
  });
  console.log('✅ Created Firebase Custom Token');

  // 2. Exchange for an ID Token via Identity Toolkit REST API
  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  
  const authData = await authRes.json();
  if (!authRes.ok) {
    console.error('❌ Failed to get ID Token:', authData);
    process.exit(1);
  }
  
  const idToken = authData.idToken;
  console.log('✅ Exchanged Custom Token for ID Token');
  
  const headers = {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  };

  // 3. /api/auth/sync
  const syncRes = await fetch(`${BASE_URL}/auth/sync`, { method: 'POST', headers });
  const syncData = await syncRes.json();
  console.log('✅ POST /auth/sync ->', syncData);

  // 4. /api/auth/me
  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers });
  const meData = await meRes.json();
  console.log('✅ GET /auth/me ->', meData.email);

  // 5. /api/products
  const prodRes = await fetch(`${BASE_URL}/products`);
  const products = await prodRes.json();
  console.log(`✅ GET /products -> Found ${products.length} products`);

  const productId = products[0].id;

  // 6. /api/store/orders (Create Order)
  const orderRes = await fetch(`${BASE_URL}/store/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ product_id: productId })
  });
  const orderData = await orderRes.json();
  console.log('✅ POST /store/orders -> Created Order ID:', orderData.id);
  const orderId = orderData.id;

  // 7. /api/store/my-orders
  const myOrdersRes = await fetch(`${BASE_URL}/store/my-orders`, { headers });
  const myOrdersData = await myOrdersRes.json();
  console.log(`✅ GET /store/my-orders -> Found ${myOrdersData.length} orders for this user`);

  // 8. /api/orders (Admin View All)
  const allOrdersRes = await fetch(`${BASE_URL}/orders`);
  const allOrdersData = await allOrdersRes.json();
  console.log(`✅ GET /orders -> Found ${allOrdersData.length} total orders system-wide`);

  // 9. /api/orders/:id (Admin Update Status)
  const patchRes = await fetch(`${BASE_URL}/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'shipped' })
  });
  const patchData = await patchRes.json();
  console.log('✅ PATCH /orders/:id -> Updated status to:', patchData.status);

  // 10. /api/orders/:id (Admin Delete)
  const delRes = await fetch(`${BASE_URL}/orders/${orderId}`, { method: 'DELETE' });
  const delData = await delRes.json();
  console.log('✅ DELETE /orders/:id -> Deleted Order ID:', delData.deleted.id);

  console.log('--- ALL ENDPOINTS TESTED SUCCESSFULLY ---');
  process.exit(0);
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
