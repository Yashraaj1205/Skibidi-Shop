export interface Cursor {
  id: number;
  sort_value?: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { id, sort_value: sortValue } = parsed as Record<string, unknown>;
    if (!Number.isInteger(id)) return null;
    if (sortValue !== undefined && typeof sortValue !== 'number') return null;
    return { id: id as number, sort_value: sortValue as number | undefined };
  } catch {
    return null;
  }
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export function paginate<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    next_cursor: hasMore ? encodeCursor(cursorOf(items[items.length - 1])) : null
  };
}
