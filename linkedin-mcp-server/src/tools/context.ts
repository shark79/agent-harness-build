import type Database from "better-sqlite3";
import type { Config } from "../config.js";
import type { PlatformAdapter } from "../platforms/types.js";

/** Everything the tool handlers need, threaded through explicitly (no hidden globals) for testability. */
export interface AppContext {
  config: Config;
  db: Database.Database;
  adapter: PlatformAdapter;
  /** Directory local media attachments must resolve inside of. See src/validation/media.ts. */
  mediaRoot: string;
}
