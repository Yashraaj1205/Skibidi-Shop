import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

import { resolveIdentity } from '../../src/services/identity';

const PROFILE = {
  id: 7,
  firebase_uid: 'uid-7',
  email: 'ada@example.com',
  display_name: 'Ada',
  photo_url: null
};

function respond(options: { roles?: string[]; seller?: { id: number; status: string } | null } = {}) {
  const roles = options.roles ?? ['customer'];
  const seller = options.seller ?? null;

  query.mockImplementation((text: string) => {
    if (text.includes('INSERT INTO users')) return Promise.resolve(queryResult([PROFILE]));
    if (text.includes('FROM user_roles')) {
      return Promise.resolve(queryResult(roles.map((key) => ({ key }))));
    }
    if (text.includes('FROM sellers')) {
      return Promise.resolve(seller ? queryResult([seller]) : queryResult([]));
    }
    return Promise.resolve(queryResult([]));
  });
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, ADMIN_EMAILS: '' };
  query.mockReset();
  respond();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('resolveIdentity', () => {
  it('upserts the profile and always grants the customer role', async () => {
    const identity = await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com', name: 'Ada' });

    expect(query.mock.calls[0][1]).toEqual(['uid-7', 'ada@example.com', 'Ada', null]);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO user_roles');
    expect(query.mock.calls[1][1]).toEqual([7, 'customer']);
    expect(identity).toMatchObject({
      user_id: 7,
      email: 'ada@example.com',
      roles: ['customer'],
      is_admin: false,
      is_seller: false,
      seller_id: null,
      seller_status: null
    });
  });

  it('derives the display name from the email local part', async () => {
    await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com' });

    expect(query.mock.calls[0][1]![2]).toBe('ada');
  });

  it('falls back to "Customer" without a name or email', async () => {
    await resolveIdentity({ uid: 'uid-7' });

    expect(query.mock.calls[0][1]![2]).toBe('Customer');
  });

  it('stores the avatar when the token carries one', async () => {
    await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com', picture: 'https://x/y.png' });

    expect(query.mock.calls[0][1]![3]).toBe('https://x/y.png');
  });

  it('grants the admin role from the ADMIN_EMAILS allowlist', async () => {
    process.env.ADMIN_EMAILS = 'ADA@example.com';
    respond({ roles: ['customer', 'admin'] });

    const identity = await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com' });

    expect(query.mock.calls[2][1]).toEqual([7, 'admin']);
    expect(identity.is_admin).toBe(true);
  });

  it('does not grant admin to accounts outside the allowlist', async () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    const identity = await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com' });

    expect(query.mock.calls.some((call) => call[1]?.[1] === 'admin')).toBe(false);
    expect(identity.is_admin).toBe(false);
  });

  it('reports an active seller account', async () => {
    respond({ roles: ['customer', 'seller'], seller: { id: 4, status: 'active' } });

    const identity = await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com' });

    expect(identity).toMatchObject({ is_seller: true, seller_id: 4, seller_status: 'active' });
  });

  it('reports a pending seller account as not yet selling', async () => {
    respond({ roles: ['customer', 'seller'], seller: { id: 4, status: 'pending' } });

    const identity = await resolveIdentity({ uid: 'uid-7', email: 'ada@example.com' });

    expect(identity).toMatchObject({ is_seller: false, seller_id: 4, seller_status: 'pending' });
  });
});
