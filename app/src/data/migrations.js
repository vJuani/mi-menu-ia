export const MIGRATIONS = [
    {
        version: 1,
        name: 'esquema inicial',
        sql: `
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);

CREATE TABLE members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT, kind TEXT NOT NULL CHECK (kind IN ('adulto','bebe')),
  sex TEXT, birth_date TEXT, height_cm REAL, weight_kg REAL, activity TEXT, training_days INTEGER,
  goal TEXT NOT NULL DEFAULT 'sin_meta', is_primary INTEGER NOT NULL DEFAULT 0,
  targets_json TEXT, optional_extras_json TEXT NOT NULL DEFAULT '[]', allergies_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE member_aversions (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE, tag TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('excluir','evitar')), PRIMARY KEY (member_id, tag)
);

CREATE TABLE baby_profile (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  started_complementary INTEGER NOT NULL DEFAULT 0, readiness_signs INTEGER NOT NULL DEFAULT 0,
  allowed_textures_json TEXT NOT NULL DEFAULT '["pure","pisado"]', updated_at TEXT
);
CREATE TABLE pediatric_notes (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date TEXT NOT NULL, text TEXT NOT NULL
);
CREATE TABLE food_introductions (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pendiente','introducido','tolerado','reaccion')),
  first_offered_at TEXT, notes TEXT, reaction TEXT, UNIQUE (member_id, ingredient_id)
);

CREATE TABLE ingredients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, default_unit TEXT NOT NULL,
  grams_per_unit REAL, per100_json TEXT, nutrition_basis TEXT, tags_json TEXT NOT NULL DEFAULT '[]',
  aliases_json TEXT NOT NULL DEFAULT '[]', is_custom INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, image_uri TEXT, total_minutes INTEGER NOT NULL,
  difficulty TEXT NOT NULL, servings REAL NOT NULL CHECK (servings > 0), utensils_json TEXT NOT NULL DEFAULT '[]',
  storage TEXT, tags_json TEXT NOT NULL DEFAULT '[]', baby_textures_json TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id), qty REAL NOT NULL CHECK (qty >= 0), unit TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('crudo','cocido')), optional INTEGER NOT NULL DEFAULT 0,
  separable INTEGER NOT NULL DEFAULT 0, added_after_baby_split INTEGER NOT NULL DEFAULT 0, note TEXT,
  PRIMARY KEY (recipe_id, position)
);
CREATE TABLE recipe_steps (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, ord INTEGER NOT NULL, text TEXT NOT NULL,
  timer_sec INTEGER, baby_split INTEGER NOT NULL DEFAULT 0, tip TEXT, PRIMARY KEY (recipe_id, ord)
);

CREATE TABLE inventory_lots (
  id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), qty REAL NOT NULL CHECK (qty >= 0),
  unit TEXT NOT NULL, location TEXT NOT NULL CHECK (location IN ('heladera','freezer','alacena')),
  state TEXT NOT NULL, purchased_at TEXT, expires_at TEXT, photo_uri TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lots_ingredient ON inventory_lots(ingredient_id);
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL, delta REAL NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL,
  operation_id TEXT NOT NULL, reverted_by TEXT, note TEXT
);
CREATE INDEX idx_mov_op ON stock_movements(operation_id);

CREATE TABLE planned_meals (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, slot TEXT NOT NULL, recipe_id TEXT NOT NULL REFERENCES recipes(id),
  member_ids_json TEXT NOT NULL, portions_json TEXT NOT NULL DEFAULT '{}', for_office INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planificada', substitutions_json TEXT NOT NULL DEFAULT '{}',
  cook_operation_id TEXT, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meals_date ON planned_meals(date);

CREATE TABLE consumption_logs (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, date TEXT NOT NULL, slot TEXT NOT NULL,
  planned_meal_id TEXT, description TEXT NOT NULL, kcal REAL, protein_g REAL
);
CREATE TABLE leftovers (
  id TEXT PRIMARY KEY, recipe_id TEXT, planned_meal_id TEXT, description TEXT NOT NULL,
  portions REAL NOT NULL CHECK (portions >= 0), location TEXT NOT NULL, stored_at TEXT NOT NULL,
  use_by TEXT, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL, suggested_qty REAL NOT NULL, unit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','comprado','no_conseguido')),
  bought_qty REAL, operation_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE scheduled_notifications (key TEXT PRIMARY KEY, os_id TEXT NOT NULL, hash TEXT NOT NULL, fire_at TEXT NOT NULL);

CREATE TABLE weights (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, kg REAL NOT NULL CHECK (kg > 0));
CREATE TABLE measurements (id TEXT PRIMARY KEY, date TEXT NOT NULL, waist_cm REAL, hip_cm REAL, chest_cm REAL, arm_cm REAL);
CREATE TABLE training_days (date TEXT PRIMARY KEY, trained INTEGER NOT NULL);
`,
    },
    {
        version: 2,
        name: 'productos por código de barras y fotos de inventario',
        sql: `
CREATE TABLE products (
  barcode TEXT PRIMARY KEY, name TEXT NOT NULL, ingredient_id TEXT REFERENCES ingredients(id),
  default_qty REAL, unit TEXT, photo_uri TEXT, source TEXT NOT NULL DEFAULT 'manual'
);
ALTER TABLE inventory_lots ADD COLUMN barcode TEXT;
CREATE TABLE frequent_products (ingredient_id TEXT PRIMARY KEY, uses INTEGER NOT NULL DEFAULT 0, last_qty REAL, last_unit TEXT);
`,
    },
    {
        version: 3,
        name: 'recetas propias: archivado y fecha de edición',
        sql: `
ALTER TABLE recipes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN updated_at TEXT;
`,
    },
    {
        version: 4,
        name: 'almuerzo de sobras de la cena',
        sql: `
ALTER TABLE planned_meals ADD COLUMN leftover_of TEXT;
ALTER TABLE planned_meals ADD COLUMN extra_portions_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX idx_meals_leftover ON planned_meals(leftover_of);
`,
    },
];
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
export async function migrate(db) {
    await db.exec('PRAGMA foreign_keys = ON;');
    const row = await db.get('PRAGMA user_version');
    const from = Number(row?.user_version ?? 0);
    for (const m of MIGRATIONS.filter((x) => x.version > from)) {
        await db.transaction(async () => {
            await db.exec(m.sql);
            await db.exec(`PRAGMA user_version = ${m.version}`);
        });
    }
    return { from, to: SCHEMA_VERSION };
}
