import { adminEmails, isAdminEmail } from '../../src/lib/roles';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('adminEmails', () => {
  it('is empty when ADMIN_EMAILS is unset', () => {
    expect(adminEmails()).toEqual([]);
  });

  it('splits, trims, lowercases and drops blank entries', () => {
    process.env.ADMIN_EMAILS = ' Owner@Example.com , ,ops@example.com, ';

    expect(adminEmails()).toEqual(['owner@example.com', 'ops@example.com']);
  });
});

describe('isAdminEmail', () => {
  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    expect(isAdminEmail('OWNER@example.com')).toBe(true);
  });

  it('rejects non-admin emails', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('never treats an empty email as admin, even with a blank allowlist', () => {
    process.env.ADMIN_EMAILS = '';

    expect(isAdminEmail('')).toBe(false);
  });
});
