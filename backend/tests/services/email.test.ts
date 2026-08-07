import type { Order } from '../../src/types';

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
  return {
    id: 42,
    customer_name: 'Ada',
    customer_email: 'ada@example.com',
    product_name: 'PlayStation 5',
    status: 'pending',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
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
  it('sends a confirmation email with order details and a 33% progress bar', async () => {
    const { sendOrderConfirmationEmail } = loadEmailModule({
      SMTP_USER: 'shop@example.com',
      SMTP_PASS: 'secret',
    });

    await sendOrderConfirmationEmail('ada@example.com', order());

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('ada@example.com');
    expect(mail.from).toBe('"Skibidi Shop" <shop@example.com>');
    expect(mail.subject).toBe('Order Confirmed #42 — Skibidi Shop');
    expect(mail.html).toContain('Hey Ada,');
    expect(mail.html).toContain('#42');
    expect(mail.html).toContain('PlayStation 5');
    expect(mail.html).toContain('width:33%');
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

  it('uses the shipping copy and a 66% progress bar for shipped orders', async () => {
    await load()('ada@example.com', order({ status: 'shipped' }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('🚚 Order #42: SHIPPED — Skibidi Shop');
    expect(mail.html).toContain('updated to <strong>shipped</strong>');
    expect(mail.html).toContain('width:66%');
  });

  it('uses the delivered copy and a full progress bar for delivered orders', async () => {
    await load()('ada@example.com', order({ status: 'delivered' }));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('🎉 Order #42: DELIVERED — Skibidi Shop');
    expect(mail.html).toContain('has been delivered');
    expect(mail.html).toContain('width:100%');
  });

  it('is a no-op when SMTP credentials are not configured', async () => {
    const { sendOrderStatusUpdateEmail } = loadEmailModule({ SMTP_PASS: 'secret' });

    await sendOrderStatusUpdateEmail('ada@example.com', order({ status: 'shipped' }));

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('swallows transport failures', async () => {
    const send = load();
    sendMail.mockRejectedValue(new Error('smtp unreachable'));

    await expect(send('ada@example.com', order({ status: 'shipped' }))).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
