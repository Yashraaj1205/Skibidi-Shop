import type { Order } from '../../src/types';
import { makeOrder } from '../helpers/fixtures';

const sendMail = jest.fn();
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport } }));

type EmailModule = typeof import('../../src/services/email');

function loadEmailModule(env: { SMTP_USER?: string; SMTP_PASS?: string }): EmailModule {
  let mod: EmailModule;

  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  if (env.SMTP_USER !== undefined) process.env.SMTP_USER = env.SMTP_USER;
  if (env.SMTP_PASS !== undefined) process.env.SMTP_PASS = env.SMTP_PASS;

  jest.isolateModules(() => {
    mod = require('../../src/services/email');
  });

  return mod!;
}

function order(overrides: Partial<Order> = {}): Order {
  return makeOrder(overrides);
}

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  process.env = { ...originalEnv };
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  sendMail.mockResolvedValue({ messageId: 'x' });
});

describe('sendOrderConfirmationEmail', () => {
  it('sends a confirmation email with order details, total and progress bar', async () => {
    const { sendOrderConfirmationEmail } = loadEmailModule({
      SMTP_USER: 'shop@example.com',
      SMTP_PASS: 'secret',
    });

    await sendOrderConfirmationEmail('ada@example.com', order());

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('ada@example.com');
    expect(mail.from).toBe('"Skibidi Shop" <shop@example.com>');
    expect(mail.subject).toBe('Order Confirmed SKB-000042 — Skibidi Shop');
    expect(mail.html).toContain('Hey Ada,');
    expect(mail.html).toContain('SKB-000042');
    expect(mail.html).toContain('PlayStation 5');
    expect(mail.html).toContain('$499.99');
    expect(mail.html).toContain('width:25%');
  });

  it('is a no-op when SMTP credentials are not configured', async () => {
    const { sendOrderConfirmationEmail } = loadEmailModule({});

    await sendOrderConfirmationEmail('ada@example.com', order());

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('is a no-op when only the user is configured', async () => {
    const { sendOrderConfirmationEmail } = loadEmailModule({ SMTP_USER: 'shop@example.com' });

    await sendOrderConfirmationEmail('ada@example.com', order());

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('swallows transport failures', async () => {
    const { sendOrderConfirmationEmail } = loadEmailModule({
      SMTP_USER: 'shop@example.com',
      SMTP_PASS: 'secret',
    });
    sendMail.mockRejectedValue(new Error('smtp unreachable'));

    await expect(sendOrderConfirmationEmail('ada@example.com', order())).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('sendOrderStatusUpdateEmail', () => {
  const load = () =>
    loadEmailModule({ SMTP_USER: 'shop@example.com', SMTP_PASS: 'secret' }).sendOrderStatusUpdateEmail;

  it('uses the shipping copy and a 75% progress bar for shipped orders', async () => {
    await load()('ada@example.com', order({ status: 'shipped' }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('🚚 Order SKB-000042: SHIPPED — Skibidi Shop');
    expect(mail.html).toContain('updated to <strong>shipped</strong>');
    expect(mail.html).toContain('width:75%');
  });

  it('uses the cancellation copy for cancelled orders', async () => {
    await load()('ada@example.com', order({ status: 'cancelled' }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('⚠️ Order SKB-000042: CANCELLED — Skibidi Shop');
    expect(mail.html).toContain('has been cancelled');
  });

  it('marks the paid step for paid orders', async () => {
    await load()('ada@example.com', order({ status: 'paid' }));

    expect(sendMail.mock.calls[0][0].html).toContain('width:50%');
  });

  it('formats non-USD totals with the currency code', async () => {
    await load()('ada@example.com', order({ status: 'shipped', currency: 'EUR', total_cents: 1250 }));

    expect(sendMail.mock.calls[0][0].html).toContain('EUR 12.50');
  });

  it('uses the delivered copy and a full progress bar for delivered orders', async () => {
    await load()('ada@example.com', order({ status: 'delivered' }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('🎉 Order SKB-000042: DELIVERED — Skibidi Shop');
    expect(mail.html).toContain('has been delivered');
    expect(mail.html).toContain('width:100%');
  });

  it('is a no-op when SMTP credentials are not configured', async () => {
    const { sendOrderStatusUpdateEmail } = loadEmailModule({ SMTP_PASS: 'secret' });

    await sendOrderStatusUpdateEmail('ada@example.com', order({ status: 'shipped' }));

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('defaults the currency to USD and shows the first step for unknown statuses', async () => {
    const { formatMoney } = loadEmailModule({ SMTP_USER: 'shop@example.com', SMTP_PASS: 'secret' });
    expect(formatMoney(500)).toBe('$5.00');

    await load()('ada@example.com', order({ status: 'refunded' as Order['status'] }));

    expect(sendMail.mock.calls[0][0].html).toContain('width:25%');
  });

  it('swallows transport failures', async () => {
    const send = load();
    sendMail.mockRejectedValue(new Error('smtp unreachable'));

    await expect(send('ada@example.com', order({ status: 'shipped' }))).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
