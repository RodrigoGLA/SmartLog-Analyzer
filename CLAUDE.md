# CLAUDE.md — Contexto para agentes de IA

Este archivo lo lee el agente al arrancar. Resume el contexto, las decisiones ya tomadas y cómo
trabajar en este repo. **Las decisiones de diseño están en `ARCHITECTURE.md`: leelo antes de
proponer cambios de estructura.**

## Contexto

Desafío técnico de Abstracta (Developer mid-level): **SmartLog Analyzer**, un prototipo que recibe
logs de microservicios, los almacena, permite consultarlos y usa un LLM para generar un resumen,
problemas categorizados y sugerencias. Lo evalúan en cuatro ejes: **criterio** (alternativas y
por qué), **calidad** (código testeable y fácil de cambiar), **robustez** (qué pasa cuando falla)
y **comunicación** (que otra persona pueda levantarlo y continuarlo sin preguntar).

El autor tiene perfil frontend y es responsable de **entender cada línea que se entrega**. En la
entrevista va a revisar código en vivo con el equipo.

## Reglas para el agente

1. **Explicá antes de escribir.** Ante cualquier cambio no trivial, primero describí el enfoque y
   la alternativa descartada, y esperá confirmación. Después implementá.
2. **Cambios chicos y commiteables.** Una etapa del plan ≈ uno o varios commits pequeños. Al
   terminar cada paso, proponé el mensaje de commit (Conventional Commits, en inglés:
   `feat(logs): add ingestion endpoint`). El autor revisa y commitea.
3. **No agregues dependencias sin justificarlas** (qué resuelve y qué alternativa hay). Preferí lo
   que ya trae Nest.
4. **Tests en el mismo paso que el código**, incluyendo casos borde y de error, no solo el camino
   feliz.
5. **Nunca** escribas secretos reales en el repo. Solo `.env` (ignorado) y `.env.example` (sin
   valores reales).
6. **No inventes requisitos.** Si algo no está definido, preguntá. Las decisiones abiertas se
   documentan en `ARCHITECTURE.md`.
7. Al terminar cada etapa, agregá una entrada en `docs/ai-usage.md`: qué se pidió, qué aportó la
   IA y qué se corrigió o rechazó. Es material obligatorio para el README.
8. Código e identificadores en **inglés**. Documentación (`README.md`, `ARCHITECTURE.md`) en
   **español**.

## Stack (decidido)

| Capa | Herramienta |
|------|-------------|
| Runtime | Node.js 26 LTS, TypeScript (strict) |
| Framework | NestJS 12 |
| Módulos | ESM (`"type": "module"`, default de `@nestjs/cli` 12) |
| Base de datos | PostgreSQL 16 |
| ORM / migraciones / seed | Prisma (agregaciones con `$queryRaw` tipado) |
| Cola de análisis | pg-boss (sobre la misma base) |
| Validación HTTP | class-validator + `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Validación respuesta LLM | Zod |
| Config | `@nestjs/config` con validación del entorno al arrancar (fail fast) |
| Health | `@nestjs/terminus` |
| LLM | `LlmProvider` → `MockLlmProvider` (default) / `GeminiLlmProvider` |
| Tests | Vitest (unit) + Supertest + Testcontainers (integración contra Postgres real) |
| Lint | oxlint (type-aware) + Prettier |
| Docs API | `@nestjs/swagger` (OpenAPI) |
| Contenedores | Dockerfile multi-stage + docker-compose (app + db) |

## Estructura objetivo

```
smartlog-analyzer/
├── README.md · ARCHITECTURE.md · CLAUDE.md
├── docs/ai-usage.md
├── src/
│   ├── main.ts · app.module.ts
│   ├── config/            # schema de env y config tipada
│   ├── common/            # filtro de errores (RFC 9457), pipes, utilidades
│   ├── database/          # PrismaService
│   ├── health/
│   ├── logs/              # controller, service, dto, repositorio de agregaciones
│   ├── analysis/          # controller, service, worker (pg-boss), dto
│   └── llm/               # llm-provider.interface.ts, mock, gemini, prompt, schema Zod, preprocessor
├── tests/                 # integración / e2e (unit tests junto al código: *.spec.ts)
├── db/                    # prisma/schema.prisma, migraciones, seed
├── Dockerfile · docker-compose.yml · .env.example
```

## Contrato de la API

Prefijo global `/api`. Errores en `application/problem+json` (RFC 9457):
`{ type, title, status, detail, instance, errors? }`.

| Método | Ruta | Respuesta OK | Errores esperables |
|--------|------|--------------|--------------------|
| POST | `/api/logs` | 201 + log creado | 400 validación |
| GET | `/api/logs?service=&level=&from=&to=&search=&page=&limit=` | 200 `{ data, meta }` | 400 filtros inválidos (`from > to`, `limit > 100`) |
| GET | `/api/logs/stats?groupBy=service\|level&interval=hour\|day&from=&to=` | 200 agregación | 400 |
| POST | `/api/logs/analyze` `{ from, to, services?, levels? }` | 202 `{ id, status }` | 400, 422 sin logs en rango |
| GET | `/api/analysis/:id` | 200 análisis | 400 uuid inválido, 404 |
| GET | `/api/health` | 200 / 503 | — |

Body de ingesta: `{ service, level, message, timestamp?, traceId?, metadata? }`. Si no viene
`timestamp`, se usa la hora de ingesta.

Códigos de error del análisis: `LLM_TIMEOUT`, `LLM_INVALID_RESPONSE`, `LLM_PROVIDER_ERROR`.

## Variables de entorno

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto HTTP de la app |
| `DATABASE_URL` | `postgresql://smartlog:smartlog@db:5432/smartlog` | Conexión a Postgres |
| `LLM_PROVIDER` | `mock` | `mock` \| `gemini` |
| `LLM_API_KEY` | *(vacío)* | Requerida solo si `LLM_PROVIDER != mock` |
| `LLM_MODEL` | `gemini-2.5-flash` | Modelo del proveedor real (verificar el vigente en la etapa 7) |
| `LLM_TIMEOUT_MS` | `20000` | Timeout por llamada al LLM |
| `ANALYSIS_MAX_PATTERNS` | `50` | Tope de patrones enviados al LLM |
| `ANALYSIS_MAX_RANGE_HOURS` | `168` | Rango máximo permitido en `/analyze` |

## Plan por etapas

Cada etapa termina con tests en verde y uno o más commits.

> **Reordenado el 2026-11-03** (decisión #18 en `ARCHITECTURE.md`): las etapas 1/2/3/4 originales
> tenían una dependencia circular (la Etapa 1 pedía correr migraciones en `docker compose up`
> antes de que la Etapa 2 creara el schema de Prisma). Se fusionaron en una sola etapa de
> "infraestructura mínima + CRUD de logs" para tener antes posible algo real para programar y
> probar. El checklist de abajo refleja el orden real; el contenido de cada etapa original sigue
> vigente, solo cambia el agrupamiento.

- [x] **0. Setup**: `nest new`, TypeScript strict, oxlint/Prettier, `.gitignore`, `.nvmrc`,
      `git init`, primer commit.
- [ ] **1. Infraestructura mínima + CRUD de logs** (fusiona las etapas 1/2/3/4 originales):
      - Postgres en Docker (`docker-compose.yml`, healthcheck) — la app sigue corriendo local.
      - Prisma: schema completo (ver ARCHITECTURE §5), migración inicial.
      - `ConfigModule` con validación fail-fast de las env vars que ya se usan (`PORT`,
        `DATABASE_URL`).
      - Base HTTP: prefijo `/api`, `ValidationPipe` global, filtro global RFC 9457.
      - Logs básico: `POST /api/logs` (upsert de servicio), `GET /api/logs` paginado. Unit +
        integración (Testcontainers) con casos borde.
      - Seed de ejemplo (`db/seed.ts`, registrado en `prisma.config.ts#migrations.seed`): 12
        servicios simulando AWS/Azure/GCP/on-prem, ~4800 logs con metadata realista por proveedor
        y ráfagas de error, idempotente (`npm run db:seed`). Adelantado desde la Etapa 2 porque el
        enunciado lo pide explícitamente ("scripts de migración y seed con datos de ejemplo").
      - **Diferido dentro de esta etapa** (se suman cuando se retome el resto de logs): filtros
        avanzados y `GET /api/logs/stats`, health check con terminus, Dockerfile de la app.
- [ ] **2. Logs — resto**:
      - `GET /api/logs/stats?groupBy=service|level&from=&to=` (consulta de agregación — requisito
        explícito del enunciado) — **hecho**. Un solo `groupBy` por request, sin bucketing por
        intervalo todavía (decisión #20 en `ARCHITECTURE.md`).
      - Filtros en `GET /api/logs` (`service`, `level`, `from`, `to`, `search`) — pendiente.
      - Health check con terminus — pendiente.
      - `interval` (hora/día) en `/api/logs/stats` — pendiente, opcional si da el tiempo.
      - Swagger/OpenAPI (`@nestjs/swagger`, servido en `/docs`) — **hecho**, adelantado desde la
        Etapa 6 para tener documentación interactiva mientras se suman endpoints (decisión #22).
- [x] **3. LLM (aislado)**: interfaz, schema Zod de respuesta, `LogPreprocessor` (normalizar,
      agrupar, recortar, enmascarar), prompt, `MockLlmProvider` con escenarios. Tests: respuesta
      válida, formato inesperado y timeout. `finding_category` libre, guiada por prompt (decisión
      #24), no un enum cerrado.
- [x] **4. Análisis**: `POST /api/logs/analyze` (202), worker pg-boss real, persistencia de
      resultados y findings, `GET /api/analysis/:id`. Test e2e del flujo completo con el mock
      (`tests/analysis.e2e-spec.ts`), incluyendo el caso 422 sin logs en rango y un caso de
      recuperación tras una falla transitoria (reintento automático de pg-boss, decisión #24).
      Se agregó a la validación de env vars `LLM_TIMEOUT_MS`/`ANALYSIS_MAX_PATTERNS`/
      `ANALYSIS_MAX_RANGE_HOURS` (decisión #15); `LLM_PROVIDER`/`LLM_API_KEY`/`LLM_MODEL` quedan
      para la Etapa 5, junto con `GeminiLlmProvider`.
      - Cola pg-boss creada y verificada (`src/queue/`: `QueueModule`, `PgBossService`, constante
        `ANALYSIS_QUEUE`), con política de reintentos explícita (decisión #24) — **hecho**.
      - El worker real vive en `src/analysis/` (`AnalysisWorkerService`), no en `src/queue/`,
        respetando la decisión #23. `tests/queue.e2e-spec.ts` (el test de pickup "de prueba" de la
        vuelta anterior) se eliminó al quedar superado por este worker real y su propio e2e
        (decisión #24) — ambos competían por la misma cola al convivir en el mismo `AppModule`.
- [ ] **5. Proveedor real**: `GeminiLlmProvider` con salida estructurada nativa + misma validación.
      Se agrega `LLM_PROVIDER`/`LLM_API_KEY`/`LLM_MODEL` a la validación de env vars. Idea anotada
      (fuera de git, `.claude/notes/analysis-worker-flow.md`): reintento "con corrección" ante
      `LLM_INVALID_RESPONSE`, reenviando el prompt 1-2 veces con el error de Zod antes de rendirse.
- [ ] **6. Cierre**: README completo (levantar, testear, uso de IA, pendientes), Dockerfile
      multi-stage de la app + `docker-compose.yml` final (app + db), revisión de ARCHITECTURE.md,
      verificación final (`docker compose up` desde cero, sin secretos en git).
- [ ] **Extras (si hay tiempo)**: CI con GitHub Actions, Makefile, logging estructurado (pino),
      ingesta por lotes.
