import { pool } from '../db/pool';
import { Payout } from '../types';

/**
 * Sweeps delivered order items that have not been paid out into one payout per seller.
 * The claiming UPDATE (`payout_id IS NULL`) is what makes double payouts impossible.
 */
export async function runPayouts(): Promise<Payout[]> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sellers = await client.query(
      `SELECT DISTINCT oi.seller_id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.payout_id IS NULL AND oi.seller_id IS NOT NULL AND o.status = 'delivered'
        ORDER BY oi.seller_id`
    );

    const payouts: Payout[] = [];

    for (const { seller_id: sellerId } of sellers.rows) {
      const created = await client.query(
        `INSERT INTO payouts (seller_id, amount_cents, status) VALUES ($1, 0, 'pending')
         RETURNING id`,
        [sellerId]
      );
      const payoutId = created.rows[0].id;

      const claimed = await client.query(
        `UPDATE order_items oi
            SET payout_id = $1
          WHERE oi.seller_id = $2
            AND oi.payout_id IS NULL
            AND oi.order_id IN (SELECT id FROM orders WHERE status = 'delivered')
          RETURNING oi.seller_earnings_cents`,
        [payoutId, sellerId]
      );

      if (claimed.rowCount === 0) {
        await client.query('DELETE FROM payouts WHERE id = $1', [payoutId]);
        continue;
      }

      const amount = claimed.rows.reduce(
        (sum: number, row: { seller_earnings_cents: number }) => sum + row.seller_earnings_cents,
        0
      );
      const payout = await client.query(
        'UPDATE payouts SET amount_cents = $2 WHERE id = $1 RETURNING *',
        [payoutId, amount]
      );
      payouts.push(payout.rows[0]);
    }

    await client.query('COMMIT');
    return payouts;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
