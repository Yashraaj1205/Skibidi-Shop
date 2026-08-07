import { decodeCursor, encodeCursor, paginate } from '../../src/lib/pagination';

describe('cursor encoding', () => {
  it('round-trips a cursor', () => {
    expect(decodeCursor(encodeCursor({ id: 12, sort_value: 4999 }))).toEqual({
      id: 12,
      sort_value: 4999
    });
  });

  it('round-trips a cursor without a sort value', () => {
    expect(decodeCursor(encodeCursor({ id: 12 }))).toEqual({ id: 12, sort_value: undefined });
  });

  it('is url-safe', () => {
    expect(encodeCursor({ id: 1, sort_value: 999999 })).not.toMatch(/[+/=]/);
  });

  it.each([
    ['garbage', 'not-base64-json'],
    ['a non-object payload', Buffer.from('42', 'utf8').toString('base64url')],
    ['a null payload', Buffer.from('null', 'utf8').toString('base64url')],
    ['a non-integer id', Buffer.from('{"id":1.5}', 'utf8').toString('base64url')],
    ['a missing id', Buffer.from('{}', 'utf8').toString('base64url')],
    [
      'a non-numeric sort value',
      Buffer.from('{"id":1,"sort_value":"cheap"}', 'utf8').toString('base64url')
    ]
  ])('rejects %s', (_label, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
});

describe('paginate', () => {
  const rows = [{ id: 3 }, { id: 2 }, { id: 1 }];

  it('trims the extra row and returns a cursor pointing at the last kept row', () => {
    const page = paginate(rows, 2, (row) => ({ id: row.id }));

    expect(page.items).toEqual([{ id: 3 }, { id: 2 }]);
    expect(decodeCursor(page.next_cursor!)).toMatchObject({ id: 2 });
  });

  it('reports no cursor on the last page', () => {
    expect(paginate(rows, 3, (row) => ({ id: row.id }))).toEqual({ items: rows, next_cursor: null });
  });

  it('handles an empty result', () => {
    expect(paginate([], 10, (row: { id: number }) => ({ id: row.id }))).toEqual({
      items: [],
      next_cursor: null
    });
  });
});
