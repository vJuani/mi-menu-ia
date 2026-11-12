import { bool, json, num, str } from './driver.js';
import { addPurchaseLot, adjustLot, consumeConfirmed, newId, undoOperation } from '../domain/inventory.js';
const b = (v) => (v ? 1 : 0);
export class Repo {
    db;
    constructor(db) { this.db = db; }
    // ---------- Ajustes ----------
    async getSetting(key, fallback) {
        const r = await this.db.get('SELECT value_json FROM settings WHERE key = ?', [key]);
        return r ? json.dec(r.value_json, fallback) : fallback;
    }
    async setSetting(key, value) {
        await this.db.run('INSERT INTO settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json', [key, json.enc(value)]);
    }
    // ---------- Integrantes ----------
    async saveMember(m) {
        await this.db.transaction(async () => {
            await this.db.run(`INSERT INTO members(id,name,short_name,kind,sex,birth_date,height_cm,weight_kg,activity,training_days,goal,is_primary,targets_json,optional_extras_json,allergies_json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, short_name=excluded.short_name, kind=excluded.kind, sex=excluded.sex,
           birth_date=excluded.birth_date, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg, activity=excluded.activity,
           training_days=excluded.training_days, goal=excluded.goal, is_primary=excluded.is_primary, targets_json=excluded.targets_json,
           optional_extras_json=excluded.optional_extras_json, allergies_json=excluded.allergies_json`, [m.id, m.name, m.shortName ?? null, m.kind, m.sex ?? null, m.birthDate ?? null, m.heightCm ?? null, m.weightKg ?? null,
                m.activity ?? null, m.trainingDaysPerWeek ?? null, m.goal, b(m.isPrimary), m.targets ? json.enc(m.targets) : null,
                json.enc(m.optionalExtras), json.enc(m.allergies)]);
            await this.db.run('DELETE FROM member_aversions WHERE member_id = ?', [m.id]);
            for (const a of m.aversions)
                await this.db.run('INSERT INTO member_aversions(member_id, tag, level) VALUES(?,?,?)', [m.id, a.tag, a.level]);
        });
    }
    async members() {
        const rows = await this.db.all('SELECT * FROM members ORDER BY is_primary DESC, kind, name');
        const av = await this.db.all('SELECT * FROM member_aversions');
        return rows.map((r) => ({
            id: String(r.id), name: String(r.name), shortName: str(r.short_name), kind: r.kind,
            sex: str(r.sex), birthDate: str(r.birth_date), heightCm: num(r.height_cm), weightKg: num(r.weight_kg),
            activity: str(r.activity), trainingDaysPerWeek: num(r.training_days), goal: r.goal,
            isPrimary: bool(r.is_primary), targets: r.targets_json ? json.dec(r.targets_json, undefined) : undefined,
            optionalExtras: json.dec(r.optional_extras_json, []), allergies: json.dec(r.allergies_json, []),
            aversions: av.filter((a) => a.member_id === r.id).map((a) => ({ tag: String(a.tag), level: a.level })),
        }));
    }
    // ---------- Bebé ----------
    async babyProfile(memberId) {
        const r = await this.db.get('SELECT * FROM baby_profile WHERE member_id = ?', [memberId]);
        if (!r)
            return null;
        const notes = await this.db.all('SELECT text FROM pediatric_notes WHERE member_id = ? ORDER BY date', [memberId]);
        return {
            memberId, startedComplementary: bool(r.started_complementary), readinessSigns: bool(r.readiness_signs),
            allowedTextures: json.dec(r.allowed_textures_json, ['pure', 'pisado']), pediatricianNotes: notes.map((n) => String(n.text)),
        };
    }
    async saveBabyProfile(p) {
        await this.db.run(`INSERT INTO baby_profile(member_id, started_complementary, readiness_signs, allowed_textures_json, updated_at) VALUES(?,?,?,?,datetime('now'))
       ON CONFLICT(member_id) DO UPDATE SET started_complementary=excluded.started_complementary, readiness_signs=excluded.readiness_signs,
       allowed_textures_json=excluded.allowed_textures_json, updated_at=excluded.updated_at`, [p.memberId, b(p.startedComplementary), b(p.readinessSigns), json.enc(p.allowedTextures)]);
    }
    async addPediatricNote(memberId, text, date) {
        await this.db.run('INSERT INTO pediatric_notes(id, member_id, date, text) VALUES(?,?,?,?)', [newId('ped'), memberId, date, text]);
    }
    async introductions(memberId) {
        const rows = await this.db.all('SELECT * FROM food_introductions WHERE member_id = ?', [memberId]);
        return rows.map((r) => ({ id: String(r.id), memberId, ingredientId: String(r.ingredient_id), status: r.status, firstOfferedAt: str(r.first_offered_at), notes: str(r.notes), reaction: str(r.reaction) }));
    }
    /** Solo se llama tras confirmación explícita del adulto en la interfaz. */
    async setIntroduction(memberId, ingredientId, status, extra = {}) {
        await this.db.run(`INSERT INTO food_introductions(id, member_id, ingredient_id, status, first_offered_at, notes, reaction) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(member_id, ingredient_id) DO UPDATE SET status=excluded.status,
         first_offered_at=COALESCE(food_introductions.first_offered_at, excluded.first_offered_at),
         notes=COALESCE(excluded.notes, food_introductions.notes), reaction=COALESCE(excluded.reaction, food_introductions.reaction)`, [newId('fi'), memberId, ingredientId, status, extra.date ?? null, extra.notes ?? null, extra.reaction ?? null]);
    }
    // ---------- Ingredientes y recetas ----------
    async saveIngredient(i, custom = false) {
        await this.db.run(`INSERT INTO ingredients(id,name,category,default_unit,grams_per_unit,per100_json,nutrition_basis,tags_json,aliases_json,is_custom) VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, default_unit=excluded.default_unit, grams_per_unit=excluded.grams_per_unit,
       per100_json=excluded.per100_json, nutrition_basis=excluded.nutrition_basis, tags_json=excluded.tags_json, aliases_json=excluded.aliases_json`, [i.id, i.name, i.category, i.defaultUnit, i.gramsPerUnit ?? null, i.per100g ? json.enc(i.per100g) : null, i.nutritionBasis ?? null, json.enc(i.tags), json.enc(i.aliases), b(custom)]);
    }
    async ingredients() {
        const rows = await this.db.all('SELECT * FROM ingredients ORDER BY name');
        return rows.map((r) => ({
            id: String(r.id), name: String(r.name), category: r.category, defaultUnit: r.default_unit,
            gramsPerUnit: num(r.grams_per_unit), per100g: r.per100_json ? json.dec(r.per100_json, undefined) : undefined,
            nutritionBasis: str(r.nutrition_basis), tags: json.dec(r.tags_json, []), aliases: json.dec(r.aliases_json, []),
        }));
    }
    async saveRecipe(r) {
        await this.db.transaction(async () => {
            await this.db.run(`INSERT INTO recipes(id,name,image_uri,total_minutes,difficulty,servings,utensils_json,storage,tags_json,baby_textures_json,is_demo,archived,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, image_uri=excluded.image_uri, total_minutes=excluded.total_minutes, difficulty=excluded.difficulty,
         servings=excluded.servings, utensils_json=excluded.utensils_json, storage=excluded.storage, tags_json=excluded.tags_json, baby_textures_json=excluded.baby_textures_json,
         is_demo=excluded.is_demo, archived=excluded.archived, updated_at=excluded.updated_at`, [r.id, r.name, r.imageUri ?? null, r.totalMinutes, r.difficulty, r.servings, json.enc(r.utensils), r.storage ?? null, json.enc(r.tags), r.babyTextures ? json.enc(r.babyTextures) : null, b(r.isDemo), b(r.archived)]);
            await this.db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [r.id]);
            await this.db.run('DELETE FROM recipe_steps WHERE recipe_id = ?', [r.id]);
            let pos = 0;
            for (const i of r.ingredients) {
                await this.db.run('INSERT INTO recipe_ingredients VALUES(?,?,?,?,?,?,?,?,?,?)', [r.id, pos++, i.ingredientId, i.qty, i.unit, i.state, b(i.optional), b(i.separable), b(i.addedAfterBabySplit), i.note ?? null]);
            }
            for (const s of r.steps) {
                await this.db.run('INSERT INTO recipe_steps VALUES(?,?,?,?,?,?)', [r.id, s.order, s.text, s.timerSec ?? null, b(s.babySplit), s.tip ?? null]);
            }
        });
    }
    /** Archivar en lugar de borrar: las comidas pasadas siguen mostrando la receta. */
    async setRecipeArchived(id, archived) {
        await this.db.run("UPDATE recipes SET archived = ?, updated_at = datetime('now') WHERE id = ?", [b(archived), id]);
    }
    /** Comidas futuras planificadas que usan la receta (para avisar antes de archivar). */
    async upcomingMealsWithRecipe(id, fromISO) {
        const r = await this.db.get("SELECT COUNT(*) AS n FROM planned_meals WHERE recipe_id = ? AND date >= ? AND status = 'planificada'", [id, fromISO]);
        return Number(r?.n ?? 0);
    }
    async customIngredientIds() {
        return (await this.db.all('SELECT id FROM ingredients WHERE is_custom = 1')).map((r) => String(r.id));
    }
    async recipes() {
        const rows = await this.db.all('SELECT * FROM recipes ORDER BY name');
        const ris = await this.db.all('SELECT * FROM recipe_ingredients ORDER BY recipe_id, position');
        const steps = await this.db.all('SELECT * FROM recipe_steps ORDER BY recipe_id, ord');
        return rows.map((r) => ({
            id: String(r.id), name: String(r.name), imageUri: str(r.image_uri), totalMinutes: Number(r.total_minutes),
            difficulty: r.difficulty, servings: Number(r.servings), utensils: json.dec(r.utensils_json, []),
            storage: str(r.storage), tags: json.dec(r.tags_json, []), babyTextures: r.baby_textures_json ? json.dec(r.baby_textures_json, []) : undefined,
            isDemo: bool(r.is_demo), archived: bool(r.archived) || undefined,
            ingredients: ris.filter((x) => x.recipe_id === r.id).map((x) => ({
                ingredientId: String(x.ingredient_id), qty: Number(x.qty), unit: x.unit, state: x.state,
                optional: bool(x.optional) || undefined, separable: bool(x.separable) || undefined, addedAfterBabySplit: bool(x.added_after_baby_split) || undefined, note: str(x.note),
            })),
            steps: steps.filter((x) => x.recipe_id === r.id).map((x) => ({ order: Number(x.ord), text: String(x.text), timerSec: num(x.timer_sec), babySplit: bool(x.baby_split) || undefined, tip: str(x.tip) })),
        }));
    }
    // ---------- Inventario ----------
    async lots() {
        const rows = await this.db.all('SELECT * FROM inventory_lots WHERE qty > 0 ORDER BY location, created_at');
        return rows.map(rowToLot);
    }
    async allLots() {
        return (await this.db.all('SELECT * FROM inventory_lots')).map(rowToLot);
    }
    async movements(operationId) {
        const rows = operationId
            ? await this.db.all('SELECT * FROM stock_movements WHERE operation_id = ? ORDER BY created_at', [operationId])
            : await this.db.all('SELECT * FROM stock_movements ORDER BY created_at');
        return rows.map(rowToMovement);
    }
    async recentOperations(limit = 20) {
        const rows = await this.db.all(`SELECT operation_id, MIN(kind) AS kind, MAX(created_at) AS created_at, COUNT(*) AS n, SUM(CASE WHEN reverted_by IS NULL THEN 0 ELSE 1 END) AS reverted
       FROM stock_movements WHERE kind != 'deshacer' GROUP BY operation_id ORDER BY created_at DESC LIMIT ?`, [limit]);
        return rows.map((r) => ({ operationId: String(r.operation_id), kind: String(r.kind), createdAt: String(r.created_at), items: Number(r.n), reverted: Number(r.reverted) > 0 }));
    }
    async addLot(input, opts = {}) {
        const op = opts.operationId ?? newId('op');
        const { lot, movement } = addPurchaseLot(input, op);
        await this.db.transaction(async () => {
            await this.insertLot(lot, opts.isDemo);
            await this.insertMovement(movement);
            await this.db.run(`INSERT INTO frequent_products(ingredient_id, uses, last_qty, last_unit) VALUES(?,1,?,?)
        ON CONFLICT(ingredient_id) DO UPDATE SET uses = uses + 1, last_qty = excluded.last_qty, last_unit = excluded.last_unit`, [lot.ingredientId, lot.qty, lot.unit]);
        });
        return lot;
    }
    async updateLotMeta(id, patch) {
        const cur = (await this.allLots()).find((l) => l.id === id);
        if (!cur)
            throw new Error('Lote inexistente');
        const n = { ...cur, ...patch };
        await this.db.run('UPDATE inventory_lots SET location=?, state=?, expires_at=?, purchased_at=?, photo_uri=? WHERE id=?', [n.location, n.state, n.expiresAt ?? null, n.purchasedAt ?? null, n.photoUri ?? null, id]);
    }
    async adjustLotQty(id, newQty) {
        const cur = (await this.allLots()).find((l) => l.id === id);
        if (!cur)
            throw new Error('Lote inexistente');
        const op = newId('op');
        const { lot, movement } = adjustLot(cur, newQty, op);
        await this.db.transaction(async () => {
            await this.db.run('UPDATE inventory_lots SET qty = ? WHERE id = ?', [lot.qty, lot.id]);
            await this.insertMovement(movement);
        });
        return op;
    }
    /** Descuenta SOLO las cantidades confirmadas por el usuario. Atómico. */
    async confirmCooked(mealId, usages, ingredients) {
        const op = newId('cook');
        return this.db.transaction(async () => {
            const lots = await this.lots();
            const res = consumeConfirmed(lots, usages, ingredients, op);
            for (const l of res.lots) {
                const before = lots.find((x) => x.id === l.id);
                if (before.qty !== l.qty)
                    await this.db.run('UPDATE inventory_lots SET qty = ? WHERE id = ?', [l.qty, l.id]);
            }
            for (const m of res.movements)
                await this.insertMovement(m);
            if (mealId)
                await this.db.run("UPDATE planned_meals SET status = 'cocinada', cook_operation_id = ? WHERE id = ?", [op, mealId]);
            return { operationId: op, shortfalls: res.shortfalls };
        });
    }
    async undo(operationId) {
        await this.db.transaction(async () => {
            const movs = await this.movements(operationId);
            const lotIds = [...new Set(movs.map((m) => m.lotId))];
            const lots = (await this.allLots()).filter((l) => lotIds.includes(l.id));
            const { lots: updated, reversals, marked } = undoOperation(lots, movs, operationId);
            for (const l of updated)
                await this.db.run('UPDATE inventory_lots SET qty = ? WHERE id = ?', [l.qty, l.id]);
            for (const r of reversals)
                await this.insertMovement(r);
            for (const m of marked)
                await this.db.run('UPDATE stock_movements SET reverted_by = ? WHERE id = ?', [m.revertedBy, m.id]);
            await this.db.run("UPDATE planned_meals SET status = 'planificada', cook_operation_id = NULL WHERE cook_operation_id = ?", [operationId]);
            await this.db.run("UPDATE shopping_items SET status = 'pendiente', bought_qty = NULL, operation_id = NULL WHERE operation_id = ?", [operationId]);
        });
    }
    async insertLot(l, isDemo) {
        await this.db.run('INSERT INTO inventory_lots(id, ingredient_id, qty, unit, location, state, purchased_at, expires_at, photo_uri, is_demo) VALUES(?,?,?,?,?,?,?,?,?,?)', [l.id, l.ingredientId, l.qty, l.unit, l.location, l.state, l.purchasedAt ?? null, l.expiresAt ?? null, l.photoUri ?? null, b(isDemo)]);
    }
    async insertMovement(m) {
        await this.db.run('INSERT INTO stock_movements(id, lot_id, ingredient_id, delta, kind, created_at, operation_id, reverted_by, note) VALUES(?,?,?,?,?,?,?,?,?)', [m.id, m.lotId, m.ingredientId, m.delta, m.kind, m.createdAt, m.operationId, m.revertedBy ?? null, m.note ?? null]);
    }
    async frequentProducts(limit = 12) {
        const rows = await this.db.all('SELECT * FROM frequent_products ORDER BY uses DESC LIMIT ?', [limit]);
        return rows.map((r) => ({ ingredientId: String(r.ingredient_id), lastQty: num(r.last_qty), lastUnit: str(r.last_unit) }));
    }
    // ---------- Plan ----------
    async saveMeal(m, isDemo = false) {
        await this.db.run(`INSERT INTO planned_meals(id,date,slot,recipe_id,member_ids_json,portions_json,for_office,status,substitutions_json,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, slot=excluded.slot, recipe_id=excluded.recipe_id, member_ids_json=excluded.member_ids_json,
       portions_json=excluded.portions_json, for_office=excluded.for_office, status=excluded.status, substitutions_json=excluded.substitutions_json`, [m.id, m.date, m.slot, m.recipeId, json.enc(m.memberIds), json.enc(m.portionsByMember), b(m.forOffice), m.status, json.enc(m.substitutions), b(isDemo)]);
    }
    async meals(fromISO, toISO) {
        const where = [];
        const params = [];
        if (fromISO) {
            where.push('date >= ?');
            params.push(fromISO);
        }
        if (toISO) {
            where.push('date <= ?');
            params.push(toISO);
        }
        const rows = await this.db.all(`SELECT * FROM planned_meals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date, slot`, params);
        return rows.map((r) => ({
            id: String(r.id), date: String(r.date), slot: r.slot, recipeId: String(r.recipe_id),
            memberIds: json.dec(r.member_ids_json, []), portionsByMember: json.dec(r.portions_json, {}), forOffice: bool(r.for_office) || undefined,
            status: r.status, substitutions: json.dec(r.substitutions_json, {}),
        }));
    }
    async deleteMeal(id) {
        await this.db.run('DELETE FROM planned_meals WHERE id = ?', [id]);
    }
    async setMealStatus(id, status) {
        await this.db.run('UPDATE planned_meals SET status = ? WHERE id = ?', [status, id]);
    }
    // ---------- Consumo, sobrantes ----------
    async logConsumption(l) {
        await this.db.run('INSERT INTO consumption_logs VALUES(?,?,?,?,?,?,?,?)', [newId('log'), l.memberId, l.date, l.slot, l.plannedMealId ?? null, l.description, l.kcal ?? null, l.proteinG ?? null]);
    }
    async consumption(fromISO, toISO) {
        const rows = await this.db.all('SELECT * FROM consumption_logs WHERE date BETWEEN ? AND ? ORDER BY date', [fromISO, toISO]);
        return rows.map((r) => ({ id: String(r.id), memberId: String(r.member_id), date: String(r.date), slot: r.slot, plannedMealId: str(r.planned_meal_id), description: String(r.description), kcal: num(r.kcal), proteinG: num(r.protein_g) }));
    }
    async addLeftover(l) {
        await this.db.run('INSERT INTO leftovers(id, recipe_id, planned_meal_id, description, portions, location, stored_at, use_by) VALUES(?,?,?,?,?,?,datetime(\'now\'),?)', [newId('left'), l.recipeId ?? null, l.plannedMealId ?? null, l.description, l.portions, l.location, l.useBy ?? null]);
    }
    async leftovers() {
        const rows = await this.db.all('SELECT * FROM leftovers WHERE consumed = 0 ORDER BY stored_at');
        return rows.map((r) => ({ id: String(r.id), description: String(r.description), portions: Number(r.portions), location: String(r.location), storedAt: String(r.stored_at), useBy: str(r.use_by) }));
    }
    async consumeLeftover(id) {
        await this.db.run('UPDATE leftovers SET consumed = 1 WHERE id = ?', [id]);
    }
    // ---------- Compras ----------
    async shoppingItems() {
        const rows = await this.db.all('SELECT * FROM shopping_items ORDER BY created_at');
        return rows.map((r) => ({ id: String(r.id), ingredientId: String(r.ingredient_id), suggestedQty: Number(r.suggested_qty), unit: r.unit, status: r.status, boughtQty: num(r.bought_qty) }));
    }
    /** Sincroniza la lista con lo calculado, conservando lo ya marcado como comprado o no conseguido. */
    async syncShoppingList(lines) {
        await this.db.transaction(async () => {
            await this.db.run("DELETE FROM shopping_items WHERE status = 'pendiente'");
            const flagged = new Set((await this.db.all("SELECT ingredient_id FROM shopping_items WHERE status = 'no_conseguido'")).map((r) => String(r.ingredient_id)));
            for (const l of lines) {
                if (flagged.has(l.ingredientId))
                    continue;
                await this.db.run('INSERT INTO shopping_items(id, ingredient_id, suggested_qty, unit) VALUES(?,?,?,?)', [newId('shop'), l.ingredientId, l.toBuy, l.unit]);
            }
        });
    }
    /** Registra la cantidad realmente comprada y la suma al inventario en la misma transacción. */
    async markBought(itemId, boughtQty, unit, location, state = 'cerrado', expiresAt) {
        const op = newId('buy');
        await this.db.transaction(async () => {
            const it = await this.db.get('SELECT * FROM shopping_items WHERE id = ?', [itemId]);
            if (!it)
                throw new Error('Ítem inexistente');
            if (it.status === 'comprado')
                throw new Error('Ya estaba marcado como comprado');
            const { lot, movement } = addPurchaseLot({ ingredientId: String(it.ingredient_id), qty: boughtQty, unit, location, state, purchasedAt: new Date().toISOString().slice(0, 10), expiresAt }, op);
            await this.insertLot(lot);
            await this.insertMovement(movement);
            await this.db.run("UPDATE shopping_items SET status = 'comprado', bought_qty = ?, operation_id = ? WHERE id = ?", [boughtQty, op, itemId]);
        });
        return op;
    }
    async markNotFound(itemId) {
        await this.db.run("UPDATE shopping_items SET status = 'no_conseguido' WHERE id = ?", [itemId]);
    }
    async clearShoppingDone() {
        await this.db.run("DELETE FROM shopping_items WHERE status != 'pendiente'");
    }
    // ---------- Notificaciones ----------
    async scheduled() {
        return (await this.db.all('SELECT * FROM scheduled_notifications')).map((r) => ({ key: String(r.key), osId: String(r.os_id), hash: String(r.hash) }));
    }
    async replaceScheduled(records) {
        await this.db.transaction(async () => {
            await this.db.run('DELETE FROM scheduled_notifications');
            for (const r of records)
                await this.db.run('INSERT INTO scheduled_notifications VALUES(?,?,?,?)', [r.key, r.osId, r.hash, r.fireAt]);
        });
    }
    // ---------- Progreso ----------
    async addWeight(date, kg) {
        await this.db.run('INSERT INTO weights(id, date, kg) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg', [newId('w'), date, kg]);
    }
    async weights() {
        return (await this.db.all('SELECT * FROM weights ORDER BY date')).map((r) => ({ id: String(r.id), date: String(r.date), kg: Number(r.kg) }));
    }
    async addMeasurement(m) {
        await this.db.run('INSERT INTO measurements VALUES(?,?,?,?,?,?)', [newId('me'), m.date, m.waistCm ?? null, m.hipCm ?? null, m.chestCm ?? null, m.armCm ?? null]);
    }
    async measurements() {
        return (await this.db.all('SELECT * FROM measurements ORDER BY date')).map((r) => ({ id: String(r.id), date: String(r.date), waistCm: num(r.waist_cm), hipCm: num(r.hip_cm), chestCm: num(r.chest_cm), armCm: num(r.arm_cm) }));
    }
    async setTraining(date, trained) {
        await this.db.run('INSERT INTO training_days VALUES(?,?) ON CONFLICT(date) DO UPDATE SET trained = excluded.trained', [date, b(trained)]);
    }
    async trainingDays(fromISO, toISO) {
        return (await this.db.all('SELECT * FROM training_days WHERE date BETWEEN ? AND ? ORDER BY date', [fromISO, toISO])).map((r) => ({ date: String(r.date), trained: bool(r.trained) }));
    }
    // ---------- Productos (código de barras) ----------
    async productByBarcode(code) {
        const r = await this.db.get('SELECT * FROM products WHERE barcode = ?', [code]);
        return r ? { barcode: String(r.barcode), name: String(r.name), ingredientId: str(r.ingredient_id), defaultQty: num(r.default_qty), unit: str(r.unit) } : null;
    }
    async saveProduct(p) {
        await this.db.run(`INSERT INTO products(barcode, name, ingredient_id, default_qty, unit) VALUES(?,?,?,?,?)
      ON CONFLICT(barcode) DO UPDATE SET name=excluded.name, ingredient_id=excluded.ingredient_id, default_qty=excluded.default_qty, unit=excluded.unit`, [p.barcode, p.name, p.ingredientId ?? null, p.defaultQty ?? null, p.unit ?? null]);
    }
    // ---------- Demo ----------
    async clearDemoData() {
        await this.db.transaction(async () => {
            await this.db.run('DELETE FROM stock_movements WHERE lot_id IN (SELECT id FROM inventory_lots WHERE is_demo = 1)');
            await this.db.run('DELETE FROM inventory_lots WHERE is_demo = 1');
            await this.db.run('DELETE FROM planned_meals WHERE is_demo = 1 OR recipe_id IN (SELECT id FROM recipes WHERE is_demo = 1)');
            await this.db.run('DELETE FROM recipes WHERE is_demo = 1');
        });
    }
}
function rowToLot(r) {
    return {
        id: String(r.id), ingredientId: String(r.ingredient_id), qty: Number(r.qty), unit: r.unit,
        location: r.location, state: r.state,
        purchasedAt: str(r.purchased_at), expiresAt: str(r.expires_at), photoUri: str(r.photo_uri),
    };
}
function rowToMovement(r) {
    return {
        id: String(r.id), lotId: String(r.lot_id), ingredientId: String(r.ingredient_id), delta: Number(r.delta),
        kind: r.kind, createdAt: String(r.created_at), operationId: String(r.operation_id),
        revertedBy: str(r.reverted_by), note: str(r.note),
    };
}
