import type { QueryResult } from 'pg';

export type MockQuery = jest.Mock<Promise<QueryResult>, [string, unknown[]?]>;

export function queryResult(rows: unknown[], rowCount = rows.length): QueryResult {
  return {
    rows,
    rowCount,
    command: '',
    oid: 0,
    fields: [],
  } as unknown as QueryResult;
}
