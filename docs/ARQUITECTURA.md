# Arquitectura — Mi Menú IA

## Principios

1. **Local primero.** Todo vive en SQLite en el iPhone. Sin cuenta, sin servidor obligatorio.
2. **Reglas deterministas por encima de la IA.** La seguridad de Helena, las restricciones y el inventario se resuelven en `src/domain`, que no hace llamadas de red (hay una prueba que lo verifica). La IA online, si se activa, solo propone, y su propuesta se valida con `validateGeneratedProposal`.
3. **Nada cambia sin confirmación.** Planificar no descuenta stock; cocinar descuenta solo lo confirmado; el asistente devuelve *acciones propuestas*; los alimentos nuevos para Helena requieren confirmación explícita.
4. **Auditable y reversible.** El inventario es un libro mayor (lotes + movimientos). Cada operación tiene `operationId` y se puede deshacer completa. `verifyLedger` comprueba que stock = suma de movimientos.

## Capas

```
┌──────────── app/ (pantallas Expo Router) ────────────┐
│  Hoy · Plan · Receta · Cocina · Inventario · Compras │
│  Asistente · Familia · Helena · Progreso · Ajustes   │
└───────────────┬──────────────────────────────────────┘
                │ useAppData(): snapshot + commit()
┌───────────────▼─────────────┐   ┌──────────────────────────┐
│ src/state/AppData.tsx       │──▶│ src/services/            │
│ commit → recarga → recalcula│   │ notifications (reconcile) │
│ compras → resincroniza avisos│  │ ai (opcional, vía backend)│
└───────────────┬─────────────┘   └──────────────────────────┘
┌───────────────▼─────────────┐   ┌──────────────────────────┐
│ src/data/repo.ts            │   │ src/domain/ (puro)        │
│ transacciones, migraciones  │◀─▶│ babySafety, adaptations,  │
│ backup, seed                │   │ inventory, shopping, ...  │
└───────────────┬─────────────┘   └──────────────────────────┘
        SqlDriver (expo-sqlite en iPhone · node:sqlite en pruebas)
```

## Modelo de datos (migración 1 y 2)

| Tabla | Contenido |
|---|---|
| `members`, `member_aversions` | Integrantes, nivel de rechazo (`excluir` / `evitar`), alergias, extras opcionales (huevo de Ro), objetivos propios |
| `baby_profile`, `pediatric_notes`, `food_introductions` | Inicio confirmado, señales de preparación, texturas, indicaciones del pediatra, estado por alimento (pendiente / introducido / tolerado / reacción) |
| `ingredients` | Catálogo con unidad base, gramos por unidad, nutrición por 100 g (crudo o cocido) y tags de reglas |
| `recipes`, `recipe_ingredients`, `recipe_steps` | Receta base: ingredientes opcionales, separables, "después de separar a Helena"; pasos con temporizador y paso de separación |
| `inventory_lots`, `stock_movements` | Lotes por ubicación/estado (`CHECK qty >= 0`) y movimientos con `operation_id` y `reverted_by` |
| `planned_meals` | Fecha, momento, receta, integrantes, porciones por persona, vianda, estado, sustituciones, operación de cocción |
| `consumption_logs`, `leftovers` | Lo que realmente se comió y sobrantes |
| `shopping_items` | Lista con cantidad sugerida, comprada real, “no lo conseguí” |
| `scheduled_notifications` | Clave determinística ↔ id del sistema + hash del contenido |
| `weights`, `measurements`, `training_days` | Progreso |
| `recipes.archived`, `recipes.updated_at` (v3) | Recetas archivadas en lugar de borradas (el historial del plan las sigue mostrando) |
| `products`, `frequent_products` (v2) | Códigos de barras asociados y productos frecuentes |
| `settings` | Ajustes en JSON (horarios, avisos, progreso de cocina pausada) |

Las migraciones usan `PRAGMA user_version`; nunca se edita una migración publicada.

## Reglas clave

### Helena (`babySafety.ts`)
- Bloqueo si no está confirmado el inicio y las señales de preparación, o si es menor de 6 meses sin indicación del pediatra.
- **Bloqueo duro**: miel (< 12 meses), formatos con riesgo de atragantamiento, crudos/poco cocidos, pescados con alto mercurio, leche de vaca como bebida (< 12 meses), ultraprocesados, alimentos con reacción registrada.
- **Bloqueo resoluble separando la porción**: sal, azúcar, alto sodio, picante, alcohol, edulcorantes → si el ingrediente está marcado `addedAfterBabySplit`, se excluye de su porción; si está en la base, se bloquea.
- **Confirmación**: cualquier alimento no introducido (alérgenos con mensaje específico). Nunca se incluye solo.
- Textura según la etapa habilitada; si la receta no tiene adaptación segura → alternativa independiente (`proposeSafeBabyAlternative`).
- Checklist fijo antes de servir + indicaciones del pediatra. Sin calorías ni porciones rígidas.

### Adultos (`adaptations.ts`)
- `excluir` en ingrediente separable/opcional → se quita de su plato; en la base → receta no apta para esa persona (el planificador no la propone para todos).
- `evitar` → se quita si es separable; si no, se avisa.
- Opcionales (huevo) → solo para quien los tiene como extra.
- Cantidades por persona = cantidad base / porciones × porción individual; nutrición estimada por persona.

### Nutrición (`nutrition.ts`)
Mifflin-St Jeor × factor de actividad; déficit del 20 % con tope de 750 kcal y piso en la tasa basal; proteína 2 g/kg de peso de referencia (IMC 25); ajuste adaptativo de ±150 kcal solo con ≥ 14 días de datos.

### Recordatorios (`reminders.ts`)
Claves estables (`faltantes:fecha`, `descongelar:comida:ingrediente`, `empezar:comida`, `vianda:comida`, `stock_bajo:ingrediente`, `peso:fecha`) + hash del contenido. `reconcile` devuelve qué cancelar, qué programar y qué dejar: no hay duplicados y los cambios de plan/inventario actualizan o cancelan.

## Estado por etapa

| Etapa | Estado |
|---|---|
| 1. Estructura, navegación, diseño, perfiles, almacenamiento | Hecho: tabs + pantallas secundarias, tema claro/oscuro, onboarding, SQLite con migraciones, respaldo |
| 2. Recetario, adaptaciones familiares, cocina guiada | Hecho: recetario, editor (crear/editar/duplicar/archivar, ingredientes propios, foto), versiones por persona, modo cocina con temporizadores, pausa y confirmación de uso |
| 3. Inventario, planificación, compras, sustituciones | Hecho |
| 4. Notificaciones, seguimiento, asistente | Hecho (asistente local + IA online opcional) |
| 5. Cámara, pruebas, distribución | Cámara fase inicial hecha; pruebas de dominio y datos hechas; pruebas de interfaz pendientes (recomendado: Maestro); instrucciones de distribución en README |

## Próximos pasos sugeridos
1. `npm run setup && npm run typecheck` y probar en Expo Go.
2. Pruebas E2E de interfaz con Maestro.
3. Fase 2 de cámara (reconocimiento de ingredientes y tickets) siempre con confirmación.
