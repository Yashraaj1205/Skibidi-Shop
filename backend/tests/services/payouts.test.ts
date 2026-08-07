import { queryResult } from '../helpers/mockPool';

const clientQuery = jest.fn();
const release = jest.fn();
const connect = jest.fn(() => Promise.resolve({ query: clientQuery, release }));
jest.mock('../../src/db/pool', () => ({ pool: { connect } }));

import { runPayouts } from '../../src/services/payouts';

const sql = () => clientQuery.mock.calls.map((call) => String(call[0]));
const callsFor = (fragment: string) =>
  clientQuery.mock.calls.filter((call) => String(call[0]).includes(fragment));

function respond(options: { sellers?: number[]; earnings?: number[] } = {}) {
  const sellers = options.sellers ?? [2];
  const earnings = options.earnings ?? [7200, 800];

  clientQuery.mockImplementation((text: string) => {
    if (text.includes('SELECT DISTINCT oi.seller_id')) {
      return Promise.resolve(queryResult(sellers.map((seller_id) => ({ seller_id }))));
    }
    if (text.includes('INSERT INTO payouts')) return Promise.resolve(queryResult([{ id: 50 }]));
    if (text.includes('SET payout_id = $1')) {
      return Promise.resolve(
        queryResult(earnings.map((seller_earnings_cents) => ({ seller_earnings_cents })))
      );
    }
    if (text.includes('UPDATE payouts SET amount_cents')) {
      return Promise.resolve(queryResult([{ id: 50, amount_cents: 8000, status: 'pending' }]));
    }
    return Promise.resolve(queryResult([]));
  });
}

beforeEach(() => {
  clientQuery.mockReset();
  release.mockClear();
  respond();
});

describe('runPayouts', () => {
  it('sweeps delivered unpaid earnings into one payout per seller', async () => {
    const payouts = await runPayouts();

    expect(sql()[0]).toBe('BEGIN');
    expect(sql()[sql().length - 1]).toBe('COMMIT');
    expect(callsFor('INSERT INTO payouts')).toHaveLength(1);
    expect(callsFor('UPDATE payouts SET amount_cents')[0][1]).toEqual([50, 8000]);
    expect(payouts).toEqual([{ id: 50, amount_cents: 8000, status: 'pending' }]);
  });

  it('claims only unpaid delivered items so a second run cannot double pay', async () => {
    await runPayouts();

    const claim = String(callsFor('SET payout_id = $1')[0][0]);
    expect(claim).toContain('oi.payout_id IS NULL');
    expect(claim).toContain("SELECT id FROM orders WHERE status = 'delivered'");
  });

  it('creates a payout per seller', async () => {
    respond({ sellers: [2, 3] });

    await runPayouts();

    expect(callsFor('INSERT INTO payouts').map((call) => call[1])).toEqual([[2], [3]]);
  });

  it('discards the payout when a concurrent run already claimed the items', async () => {
    respond({ earnings: [] });

    const payouts = await runPayouts();

    expect(callsFor('DELETE FROM payouts')[0][1]).toEqual([50]);
    expect(payouts).toEqual([]);
  });

  it('returns nothing when there is no delivered unpaid work', async () => {
    respond({ sellers: [] });

    await expect(runPayouts()).resolves.toEqual([]);
    expect(callsFor('INSERT INTO payouts')).toHaveLength(0);
  });

  it('rolls back and releases the connection on failure', async () => {
    clientQuery.mockImplementation((text: string) =>
      text.includes('INSERT INTO payouts')
        ? Promise.reject(new Error('deadlock detected'))
        : Promise.resolve(queryResult([{ seller_id: 2 }]))
    );

    await expect(runPayouts()).rejects.toThrow('deadlock detected');
    expect(sql()).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('still releases the connection when the rollback fails', async () => {
    clientQuery.mockImplementation((text: string) => {
      if (text === 'ROLLBACK') return Promise.reject(new Error('connection lost'));
      if (text.includes('INSERT INTO payouts')) return Promise.reject(new Error('deadlock detected'));
      return Promise.resolve(queryResult([{ seller_id: 2 }]));
    });

    await expect(runPayouts()).rejects.toThrow('deadlock detected');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
