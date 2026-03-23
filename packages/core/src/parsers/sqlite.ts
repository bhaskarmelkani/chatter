import Database from "better-sqlite3";

/**
 * Read-only SQLite accessor that safely handles WAL mode databases
 * currently being written to by other processes (e.g., Codex).
 */
export class ReadOnlySqlite {
  private db: Database.Database | null = null;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Open the database in read-only mode */
  open(): void {
    if (this.db) return;
    try {
      this.db = new Database(this.path, { readonly: true, fileMustExist: true });
      // Set pragmas for safe concurrent reading
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("busy_timeout = 1000");
    } catch (err) {
      this.db = null;
      throw new Error(`Failed to open SQLite database at ${this.path}: ${err}`);
    }
  }

  /** Close the database connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** Check if the database file exists and is readable */
  isAvailable(): boolean {
    try {
      const db = new Database(this.path, { readonly: true, fileMustExist: true });
      db.close();
      return true;
    } catch {
      return false;
    }
  }

  /** Run a query and return all rows */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    if (!this.db) {
      this.open();
    }
    try {
      const stmt = this.db!.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    } catch (err) {
      throw new Error(`SQLite query failed: ${err}`);
    }
  }

  /** Run a query and return a single row */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): T | undefined {
    if (!this.db) {
      this.open();
    }
    try {
      const stmt = this.db!.prepare(sql);
      return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
    } catch (err) {
      throw new Error(`SQLite query failed: ${err}`);
    }
  }

  /** Get list of tables in the database */
  getTables(): string[] {
    const rows = this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    return rows.map((r) => r.name);
  }
}
