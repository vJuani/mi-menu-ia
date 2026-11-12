# Mi Menú IA

App personal para iPhone (React Native + Expo + TypeScript + SQLite) que responde tres preguntas: **qué comemos, cómo lo cocino y qué tengo que comprar**, para una familia de tres (adulto en pérdida de grasa, Ro con preferencias propias y Helena en alimentación complementaria).

> El nombre es provisional: cambialo en `src/config/app.ts` (`APP_NAME`) y en `app.json` (`expo.name`).

---

## 1. Requisitos

| Para | Necesitás |
|---|---|
| Correr pruebas | Node.js ≥ 22.6 (usa `node:test` y `node:sqlite`, sin dependencias) |
| Desarrollar | Node ≥ 22.6, npm, cuenta gratuita de Expo |
| Instalar en el iPhone | Opción A: Mac con Xcode + Apple ID gratis. Opción B: Apple Developer Program (USD 99/año) + EAS Build (no requiere Mac) |

## 2. Instalación

```bash
cd mi-menu-ia
npm run setup        # npm install + npx expo install (elige las versiones compatibles con Expo SDK 58)
npm test             # 59 pruebas automatizadas
npm run typecheck    # chequeo de tipos de todo el proyecto (requiere el paso anterior)
```

`npm run setup` usa `npx expo install`, que fija automáticamente las versiones de cada módulo nativo compatibles con el SDK. Por eso `package.json` solo declara `expo`.

## 3. Ejecutar

**Prueba rápida con Expo Go** (sin compilar): instalá Expo Go desde el App Store, corré `npm start` y escaneá el QR con la cámara. SQLite, notificaciones locales, cámara y temporizadores funcionan en Expo Go.

**Build de desarrollo en el iPhone (Mac + cable):**

```bash
npx expo prebuild --platform ios
npm run ios:device   # Xcode firma con tu Apple ID ("Personal Team")
```

Con Apple ID gratuito la app **caduca a los 7 días** y hay que volver a instalarla. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confiar en tu certificado. En iOS 16+ también hay que activar el **Modo desarrollador**.

## 4. Generar una compilación iOS instalable (sin Mac)

Requiere Apple Developer Program (USD 99/año). La app instalada dura lo que el perfil (1 año).

```bash
npm i -g eas-cli
eas login
eas build:configure                 # vincula el proyecto (usa eas.json incluido)
eas device:create                   # registra tu iPhone (abrís un link en el iPhone)
npm run build:ios:preview           # build "internal distribution" (ad hoc)
```

Al terminar, EAS te da un link/QR: abrilo en el iPhone para instalar. Alternativa: `eas build -p ios --profile production` + `eas submit` para usarla vía **TestFlight**.

## 5. Estructura

```
app/                     Pantallas (Expo Router)
  (tabs)/                Hoy · Plan · Inventario · Asistente · Más
  recetas.tsx            Recetario: búsqueda, filtros, activas/archivadas
  receta/[id].tsx        Detalle: versiones por persona, ingredientes, nutrición, "No tengo", editar/duplicar/archivar
  receta/editar.tsx      Editor: ingredientes (también propios), pasos con temporizador, Helena, foto, vista previa
  cocina/[id].tsx        Modo cocina: pantalla activa, temporizadores, checklist, pausa/continuar, confirmación de uso
  cambiar/[mealId].tsx   Cambiar comida (ordenado por lo que hay en casa)
  compras.tsx            Lista de compras: hoy / semana / comprados, cantidades reales, "No lo conseguí"
  familia.tsx, helena.tsx, progreso.tsx, ajustes.tsx, escanear.tsx, onboarding.tsx
src/domain/              Reglas puras, sin red ni React (100 % testeadas)
  babySafety.ts          Motor de seguridad de Helena
  adaptations.ts         "Cocinar una vez para los tres"
  inventory.ts           Lotes + movimientos, consumo confirmado, deshacer, verificación de integridad
  shopping.ts            Lista consolidada, asignación cronológica de stock
  substitutions.ts       Reemplazos válidos por grupo, restricciones y seguridad infantil
  reminders.ts           Recordatorios determinísticos + reconciliación sin duplicados
  recipeEditor.ts        Validación de borradores, ingredientes propios con etiquetas de seguridad
  planner.ts, nutrition.ts, progress.ts, textParser.ts, assistant.ts, units.ts
src/data/                SQLite: migraciones, repositorio, respaldo, catálogo, datos demo
src/services/            Notificaciones (expo-notifications) e IA online opcional
server/proxy.mjs         Backend opcional para IA (guarda la clave del proveedor)
tests/                   Pruebas (node:test + SQLite real)
docs/ARQUITECTURA.md     Arquitectura, modelo de datos, reglas y estado por etapa
```

## 6. Pruebas

`npm test` corre 59 pruebas sin instalar nada (Node 22.6+):

- `tests/obligatorias.test.ts`: los 12 casos de la sección 14 de los requisitos (el 10 está en persistencia).
- `tests/persistencia.test.ts`: cierra y reabre una base SQLite real en disco; transacciones, rechazos de cantidades negativas, compras con cantidad real, respaldo/restauración, borrado de demo.
- `tests/editor.test.ts`: validación del editor, ingredientes propios con etiquetas de seguridad, duplicado, archivado, migración 2 → 3 sobre una base existente.
- `tests/dominio.test.ts`: fórmulas, parser de texto libre, tendencia de peso, conversiones, validación de respuestas de IA.

Las pantallas no tienen pruebas automatizadas de interfaz (ver limitaciones).

## 7. Dependencias

| Paquete | Para qué |
|---|---|
| expo, expo-router | Base y navegación por archivos |
| expo-sqlite | Persistencia local con migraciones |
| expo-notifications | Recordatorios locales y temporizadores con la app en segundo plano |
| expo-camera | Códigos de barras y fotos de productos |
| expo-image-picker | Foto de platos desde la cámara o la galería |
| expo-keep-awake | Pantalla activa en modo cocina |
| expo-file-system, expo-sharing, expo-document-picker | Exportar / importar respaldos |
| react-native-safe-area-context, react-native-screens | Requeridas por Expo Router |

Las pruebas no usan dependencias externas.

## 8. Costos

| Concepto | Costo |
|---|---|
| App, base de datos, notificaciones, asistente local | USD 0 |
| Instalar con Mac + Apple ID gratis | USD 0 (reinstalar cada 7 días) |
| Apple Developer Program (ad hoc 1 año o TestFlight) | USD 99/año |
| EAS Build | Plan gratuito con cantidad limitada de builds por mes; planes pagos opcionales |
| IA online (opcional) | Pago por uso del proveedor + hosting del backend |

## 9. Limitaciones conocidas (honestas)

- **No compilado en un dispositivo todavía.** El dominio y la capa de datos están verificados con pruebas y `tsc` estricto; las pantallas se escribieron contra las APIs de Expo SDK 58 pero se chequearon sin los tipos reales (no había acceso a npm en el entorno). Corré `npm run typecheck` tras `npm run setup` y corregí lo que aparezca.
- **Notificaciones en iOS**: se programan con la información conocida al abrir la app o al cambiar el plan/inventario. Con la app cerrada no se recalculan. iOS admite hasta 64 pendientes; la app programa como máximo 60, priorizando las más próximas.
- **Fotos de platos**: las recetas demo usan una ilustración (emoji); desde el editor podés sacar o elegir una foto propia. No se usan fotos de stock.
- **Ingredientes propios**: la app pre-marca sal, azúcar, miel, riesgo de atragantamiento y alérgenos según el nombre, pero es una ayuda: revisá las casillas al crearlos, porque de eso depende la protección de Helena.
- **Nutrición**: valores estimados con tablas de referencia. El cálculo usa pesos crudos o cocidos según cada ingrediente y se indica en pantalla.
- **Cámara**: fase inicial (códigos de barras con base local que vos vas completando, y fotos). Reconocimiento de ingredientes, tickets y platos por foto: fase posterior, no implementada.
- **Asistente**: el modo local entiende las consultas frecuentes de los requisitos. Consultas libres requieren configurar el backend de IA (`server/proxy.mjs` + `EXPO_PUBLIC_AI_PROXY_URL`). Toda respuesta generativa se valida con las reglas locales.
- **Helena**: las reglas siguen recomendaciones generales (OMS, AAP, SAP). No reemplazan al pediatra. La app no asume que comenzó la alimentación complementaria: hay que confirmarlo.
