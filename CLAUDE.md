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

- [ ] **0. Setup**: `nest new`, TypeScript strict, oxlint/Prettier, `.gitignore`, `.nvmrc`,
      `git init`, primer commit.
- [ ] **1. Contenedores y config**: Dockerfile multi-stage, `docker-compose.yml` (app + Postgres
      con healthcheck), `.env.example`, `ConfigModule` con validación. `docker compose up` levanta
      todo y corre las migraciones al iniciar.
- [ ] **2. Base de datos**: schema Prisma (ver ARCHITECTURE §5), migración inicial y seed realista
      (4–5 servicios, ráfagas de errores repetidos, un incidente encadenado entre servicios).
- [ ] **3. Base HTTP**: prefijo `/api`, `ValidationPipe` global, filtro global RFC 9457, health
      con terminus (chequea la DB).
- [ ] **4. Logs**: `POST /api/logs` (upsert de servicio), `GET /api/logs` con filtros y paginación,
      `GET /api/logs/stats`. Unit + integración con casos borde.
- [ ] **5. LLM (aislado)**: interfaz, schema Zod de respuesta, `LogPreprocessor` (normalizar,
      agrupar, recortar, enmascarar), prompt, `MockLlmProvider` con escenarios. Tests: respuesta
      válida, formato inesperado y timeout.
- [ ] **6. Análisis**: `POST /api/logs/analyze` (202), worker pg-boss, persistencia de resultados y
      findings, `GET /api/analysis/:id`. Tests de integración del flujo completo con el mock.
- [ ] **7. Proveedor real**: `GeminiLlmProvider` con salida estructurada nativa + misma validación.
- [ ] **8. Cierre**: Swagger, README completo (levantar, testear, uso de IA, pendientes), revisión
      de ARCHITECTURE.md, verificación final (`docker compose up` desde cero, sin secretos en git).
- [ ] **Extras (si hay tiempo)**: CI con GitHub Actions, Makefile, logging estructurado (pino),
      ingesta por lotes.
