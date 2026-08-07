import { pool } from '../db/pool';
import { isAdminEmail } from '../lib/roles';
import { RoleKey, SellerStatus } from '../types';

export interface Identity {
  user_id: number;
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  roles: RoleKey[];
  is_admin: boolean;
  is_seller: boolean;
  seller_id: number | null;
  seller_status: SellerStatus | null;
}

export interface DecodedIdentity {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

async function grantRole(userId: number, role: RoleKey): Promise<void> {
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE key = $2
     ON CONFLICT DO NOTHING`,
    [userId, role]
  );
}

/**
 * Turns a verified Firebase token into the server's own view of the caller:
 * the profile row plus the roles stored in Postgres. Roles never come from the client.
 */
export async function resolveIdentity(decoded: DecodedIdentity): Promise<Identity> {
  const email = decoded.email || '';
  const displayName = decoded.name || email.split('@')[0] || 'Customer';

  const profile = await pool.query(
    `INSERT INTO users (firebase_uid, email, display_name, photo_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid)
     DO UPDATE SET email = $2, display_name = $3, photo_url = $4
     RETURNING id, firebase_uid, email, display_name, photo_url`,
    [decoded.uid, email, displayName, decoded.picture || null]
  );
  const user = profile.rows[0];

  await grantRole(user.id, 'customer');
  if (isAdminEmail(email)) await grantRole(user.id, 'admin');

  const [roleRows, sellerRows] = await Promise.all([
    pool.query('SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1', [
      user.id
    ]),
    pool.query('SELECT id, status FROM sellers WHERE user_id = $1', [user.id])
  ]);

  const roles = roleRows.rows.map((row) => row.key as RoleKey);
  const seller = sellerRows.rowCount === 0 ? null : sellerRows.rows[0];

  return {
    user_id: user.id,
    firebase_uid: user.firebase_uid,
    email: user.email,
    display_name: user.display_name,
    photo_url: user.photo_url || undefined,
    roles,
    is_admin: roles.includes('admin'),
    is_seller: seller !== null && seller.status === 'active',
    seller_id: seller ? seller.id : null,
    seller_status: seller ? (seller.status as SellerStatus) : null
  };
}
