import { SCHEMA_VERSION } from './migrations.js';
export const BACKUP_TABLES = [
    'settings', 'members', 'member_aversions', 'baby_profile', 'pediatric_notes', 'food_introductions',
    'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps', 'inventory_lots', 'stock_movements',
    'planned_meals', 'consumption_logs', 'leftovers', 'shopping_items', 'weights', 'measurements',
    'training_days', 'products', 'frequent_products',
];
export async function exportBackup(db) {
    const tables = {};
    for (const t of BACKUP_TABLES)
        tables[t] = await db.all(`SELECT * FROM ${t}`);
    return { app: 'mi-menu-ia', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}
export async function importBackup(db, data) {
    const b = data;
    if (!b || b.app !== 'mi-menu-ia' || typeof b.tables !== 'object')
        throw new Error('El archivo no es un respaldo de Mi Menú IA.');
    if (b.schemaVersion > SCHEMA_VERSION)
        throw new Error('El respaldo es de una versión más nueva de la app. Actualizá la app primero.');
    let rows = 0;
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
        await db.transaction(async () => {
            for (const t of [...BACKUP_TABLES].reverse())
                await db.run(`DELETE FROM ${t}`);
            await db.run('DELETE FROM scheduled_notifications'); // se reprograman al abrir
            for (const t of BACKUP_TABLES) {
                for (const row of b.tables[t] ?? []) {
                    const cols = Object.keys(row);
                    if (!cols.every((c) => /^[a-z_0-9]+$/.test(c)))
                        throw new Error(`Columna inválida en ${t}`);
                    await db.run(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
                    rows++;
                }
            }
        });
    }
    finally {
        await db.exec('PRAGMA foreign_keys = ON;');
    }
    return { rows };
}
