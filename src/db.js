import Database from "@tauri-apps/plugin-sql";

let _db = null;

export async function getDb() {
  if (!_db) {
    _db = await Database.load("sqlite:glins_studio.db");
  }
  return _db;
}

export async function query(sql, params = []) {
  const db = await getDb();
  return db.select(sql, params);
}

export async function execute(sql, params = []) {
  const db = await getDb();
  return db.execute(sql, params);
}
