/** DI token for the drizzle `Db` instance — repositories and services inject this. */
export const DB = Symbol("DB");

/** DI token for the raw `{ db, queryClient }` connection — held for pool shutdown. */
export const DB_CONNECTION = Symbol("DB_CONNECTION");
