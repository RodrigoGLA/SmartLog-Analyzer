# SmartLog Analyzer

Desafío técnico de Abstracta: una API que recibe logs de microservicios, permite consultarlos y
agregarlos, y usa un LLM para analizar un rango de logs y devolver un resumen, hallazgos
categorizados y sugerencias.

El detalle de diseño (diagrama de componentes, flujo del análisis, modelo de datos y cada decisión
técnica con su alternativa descartada) está en **[ARCHITECTURE.md](ARCHITECTURE.md)**. Este README
es solo la puerta de entrada: qué hace y cómo correrlo.

## Qué hace

- **`POST /api/logs`** — ingesta un log, registrando el servicio si no existe.
- **`GET /api/logs`** — lista logs paginados, con filtros (`service`, `level`, `from`, `to`,
  `search`).
- **`GET /api/logs/stats`** — agrega logs por servicio o por nivel (consulta de agregación).
- **`POST /api/logs/analyze`** — encola un análisis de IA sobre un rango de logs (202, asíncrono;
  real con Gemini o determinístico con el mock por default — ver nota en "Cómo correrlo").
- **`GET /api/analysis/:id`** — consulta el resultado (`pending` → `processing` →
  `completed`/`failed`, con `summary`, `findings` y `suggestions`, o el error).
- **`GET /api/health`** — estado del servicio y su conexión a la base.

El análisis corre en un worker separado (cola `pg-boss` sobre la misma Postgres): el log se agrupa
en patrones, se enmascaran datos sensibles, y se le pide al LLM un JSON validado con Zod. Si la
respuesta no cumple el contrato, el worker reintenta con el error de validación antes de rendirse.
Ver el diagrama de flujo y las decisiones #3–#5, #24–#25 y #28 en ARCHITECTURE.md.

## Stack

NestJS + TypeScript, PostgreSQL + Prisma 7, `pg-boss` como cola (sin Redis), Zod para validar la
salida del LLM, Google Gemini como proveedor real (con un mock para desarrollo/tests). Swagger en
`/docs`. Por qué cada una de estas elecciones: ARCHITECTURE.md §6 (decisiones #1–#3, #7, #13).

## Cómo correrlo

Requisito mínimo para probarlo: **solo Docker Desktop** (ver más abajo, "Todo en Docker"). Node
26.x (ver `engines` en `package.json`) hace falta únicamente si vas a correr la app local para
iterar sobre el código, o los tests e2e (que además levantan un Postgres efímero con
Testcontainers, usando el mismo Docker).

**Desarrollo local** (recompila al vuelo, recomendado mientras se itera):

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate:dev
npm run start:dev
```

`db:migrate:dev` aplica las migraciones y corre el seed de ejemplo automáticamente (12 servicios,
~4800 logs — decisión #19). La app queda en `http://localhost:3000`, con Swagger interactivo en
`http://localhost:3000/docs`.

**Todo en Docker** (app + base, sin instalar nada local):

```bash
cp .env.example .env
docker compose up --build
```

El container de la app corre solo, al arrancar, las migraciones (`prisma migrate deploy`) y el seed
de ejemplo (12 servicios, ~4800 logs) — queda listo para probar sin ningún paso manual extra. El
seed es idempotente: se puede reiniciar el container las veces que haga falta sin duplicar datos.

> **Importante — mock vs. análisis real**: por defecto `LLM_PROVIDER=mock` en `.env.example`, así
> que no hace falta ninguna key para probar **todo el sistema** (ingesta, filtros, stats, el flujo
> asíncrono completo de `/analyze` con sus reintentos, etc.). Pero el `summary`/`findings`/
> `suggestions` que te va a devolver en ese modo **no los genera una IA real**: `MockLlmProvider`
> (`src/llm/mock-llm-provider.ts`) arma ese texto con una plantilla fija a partir de los datos
> reales (cuántos patrones hay, cuál es el más frecuente, en qué servicio) — es determinístico, sin
> llamar a ningún LLM. Para ver el análisis generado de verdad por Gemini, generar una key gratuita
> en [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y completar
> `LLM_PROVIDER=gemini` + `LLM_API_KEY` en `.env`.

El resto de las variables (timeouts, límites de paginación/patrones, reintentos) están
documentadas con sus defaults en `.env.example`.

## Cómo testear

```bash
npm test          # unitarios (Prisma/pg-boss mockeados)
npm run test:e2e  # integración (Docker arriba — Testcontainers levanta Postgres por test)
npm run lint       # oxlint, type-aware
```

## Uso de IA

- **En la app**: el análisis usa un LLM (Gemini, o un mock con escenarios para tests) detrás de una
  interfaz (`LlmProvider`) intercambiable por variable de entorno. **Con el mock (default) el
  análisis no es generado por IA** — es una plantilla determinística armada a partir de los datos
  reales, útil para probar todo el flujo sin key ni costo (ver nota en "Cómo correrlo" para activar
  Gemini real). La salida se valida con Zod antes de persistirse; ver ARCHITECTURE.md §4 y las
  decisiones #4, #5, #25 y #28.
- **En el desarrollo**: este proyecto se construyó con asistencia de Claude Code. El detalle de cada
  sesión (qué se pidió, qué se corrigió, qué decisiones se tomaron sin consultar) está en
  **[docs/ai-usage.md](docs/ai-usage.md)**.

## Qué queda afuera

El checklist completo de etapas, con lo que está hecho y lo que falta, está en
**[CLAUDE.md](CLAUDE.md)**; las limitaciones conocidas y qué cambiaría en producción están en
**ARCHITECTURE.md §8**.
