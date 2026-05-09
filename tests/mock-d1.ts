/**
 * D1Database mock for integration testing.
 *
 * Supports the chain: db.prepare(sql).bind(...).first<T>() / .run()
 * Records all queries and returns configured results per SQL pattern.
 */

export interface QueryRecord {
  sql: string;
  params: unknown[];
}

export class MockD1 {
  private results: Map<string, unknown> = new Map();
  public queries: QueryRecord[] = [];

  /**
   * Configure a result for a matching SQL statement (substring match).
   * The first matching statement wins.
   */
  setResult(sqlSubstring: string, result: unknown): void {
    this.results.set(sqlSubstring, result);
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(sql, this);
  }
}

class MockStatement {
  private sql: string;
  private db: MockD1;
  private params: unknown[] = [];

  constructor(sql: string, db: MockD1) {
    this.sql = sql;
    this.db = db;
  }

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    this.db.queries.push({ sql: this.sql, params: this.params });
    const result = this.findResult();
    return (result as T | null) ?? null;
  }

  async run(): Promise<{ success: boolean; meta: { duration: number; changes: number; last_row_id: number } }> {
    this.db.queries.push({ sql: this.sql, params: this.params });
    return { success: true, meta: { duration: 0, changes: 1, last_row_id: 1 } };
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean }> {
    this.db.queries.push({ sql: this.sql, params: this.params });
    const result = this.findResult();
    return { results: (result as T[]) ?? [], success: true };
  }

  private findResult(): unknown {
    for (const [pattern, result] of this.db.results) {
      if (this.sql.includes(pattern)) {
        return result;
      }
    }
    return undefined;
  }
}
