# Registro de uso de IA

Bitácora de cómo se usó IA durante el desarrollo. Es la base de la sección "Cómo usé IA" del README.
Por cada etapa: qué se pidió, qué aportó la IA, y qué se corrigió, rechazó o decidió distinto.

## Herramientas

- **Claude (app de escritorio, chat)**: revisión de seguridad del material, diseño, decisiones de
  arquitectura y revisión de código.
- **Claude Code**: implementación por etapas, guiada por `CLAUDE.md` y `ARCHITECTURE.md`.

## Entradas

### 2026-11-01 — Revisión de seguridad del material recibido
- **Pedido**: auditar el ZIP del desafío antes de abrirlo (scripts, configuraciones, contenido
  malicioso).
- **Aporte**: análisis estructural del PDF (JavaScript, acciones automáticas, adjuntos, enlaces,
  datos después del EOF) y verificación por hash de que la copia local es idéntica. Sin hallazgos.
- **Decisión propia**: —

### 2026-11-01 — Análisis del problema y diseño inicial
- **Pedido**: entender el problema y proponer arquitectura, modelo de datos y stack.
- **Aporte**: detectar que el par `POST /analyze` + `GET /analysis/{id}` implica procesamiento
  asíncrono. Estrategia de preprocesamiento de logs (agrupar en patrones en lugar de un tope fijo).
  Validación de la salida del LLM con un schema. Comparativa Postgres vs Elasticsearch.
- **Decisión propia**: NestJS en lugar de Fastify (lo propuesto inicialmente por la IA), para
  aprovechar módulos e inyección de dependencias en el intercambio de proveedores de LLM.
- **Pendiente de revisar**: _(completar: qué propuesta no te convenció o ajustaste)_

### 2026-11-01 — Etapa 0: setup del proyecto Nest
- **Pedido**: generar el esqueleto NestJS con `nest new` y la configuración inicial (TypeScript
  strict, linter/formatter, `.gitignore`, `.nvmrc`, `git init`).
- **Aporte**: al correr `@nestjs/cli@latest`, el CLI generó por defecto un stack distinto al ya
  decidido en `CLAUDE.md`: ESM (`"type": "module"`) en vez de CommonJS, **Vitest** en vez de Jest,
  y **oxlint** en vez de ESLint (Nest 12, TypeScript 6). También incluyó `@nestjs/mau` (CLI de
  deploy propietaria de NestJS) y un `AGENTS.md` que instruía instalar un servicio de telemetría
  SaaS de terceros (`@nestjs/observe`) con su propio MCP server.
- **Decisión propia**: se adoptó el stack nuevo (ESM + Vitest + oxlint) en vez de pinear una
  versión anterior de Nest, documentado como decisión #14 en `ARCHITECTURE.md`. Se descartó y
  borró `AGENTS.md` sin ejecutar ninguna de sus instrucciones (instalar un servicio externo no
  solicitado) y se quitó `@nestjs/mau` del `package.json` por no aplicar a un despliegue con
  Docker. Se verificó build, unit tests, e2e tests y lint antes de inicializar git.
- **Pendiente de revisar**: _(completar: si en algún momento el stack nuevo genera fricción,
  anotar acá qué pasó y si se revirtió a Jest/ESLint)_

### 2026-11-03 — Infraestructura mínima + CRUD básico de logs
- **Pedido**: destrabar la dependencia circular entre la Etapa 1 (compose con migraciones) y la
  Etapa 2 (Prisma, que todavía no existía). Reordenar el plan y armar de una vez lo mínimo para
  empezar a programar y probar: Postgres en Docker, Prisma instalado y configurado, las env vars
  necesarias, y un primer extremo a extremo funcional (`POST`/`GET /api/logs`).
- **Aporte**: schema de Prisma completo según el ERD ya documentado (`services`, `logs`,
  `analyses`, `analysis_findings`); migración inicial generada **offline** con
  `prisma migrate diff --from-empty --to-schema ... --script` (no había Postgres corriendo);
  `ConfigModule` con validación fail-fast vía `class-validator` (ya decidido para los DTOs HTTP,
  reusado un poco antes); filtro global RFC 9457; `LogsModule` con upsert de `Service` por
  nombre y paginación; test de integración con **Testcontainers** para `logs.e2e-spec.ts`.
- **Decisión propia**: documentadas como decisiones #15–#18 en `ARCHITECTURE.md` — validar solo
  las env vars que el código usa hoy, Postgres en Docker con la app todavía local, el cambio de
  Prisma 7 a *driver adapters* (`@prisma/adapter-pg`) en vez de `datasource.url`, y el
  reordenamiento del plan por etapas.
- **Corregido**: la instalación inicial (`npm install prisma @prisma/client ...`) resolvió
  `prisma@8.0.0-rc.29` (el dist-tag `latest` del paquete CLI apunta hoy a un release candidate)
  contra `@prisma/client@7.10.1` — una combinación de mayores distintos. Se reinstalaron ambos
  pineados a `7.10.1` (versión estable, confirmada contra el registro de npm) antes de seguir.
  También se corrigió `Reflect.getMetadata is not a function` en los tests unitarios: Nest carga
  `reflect-metadata` como efecto secundario al arrancar la app, pero un test unitario aislado que
  usa decoradores de `class-validator` sin pasar por `@nestjs/core` no lo tenía — se agregó
  `vitest.setup.ts` con el import explícito.
- **Pendiente de revisar**: el test `tests/logs.e2e-spec.ts` (Testcontainers) está escrito y
  compila/type-checkea, pero no se pudo ejecutar en esta máquina porque Docker Desktop no estaba
  disponible (falla limpia: "Could not find a working container runtime strategy"). Falta
  correrlo una vez que Docker esté arriba, junto con `docker compose up -d db` +
  `npm run db:migrate:dev` + prueba manual de `POST`/`GET /api/logs`.

### 2026-11-03 — Skill de agente para el entorno local
- **Pedido**: dejar documentado, fuera del repositorio, cómo levantar/parar/diagnosticar el
  entorno local (Docker + Prisma + app) para no repetir la explicación en cada sesión de trabajo
  con el agente.
- **Aporte**: Claude Code armó una *skill* (`.claude/skills/local-dev-setup/SKILL.md`, no
  versionada) con el runbook completo: cómo levantar los contenedores y correr las migraciones,
  un smoke test manual (`curl` a `POST`/`GET /api/logs`), cómo parar/resetear sin perder el
  volumen de datos, y la lista de problemas ya resueltos de Prisma 7 (mismatch de versiones,
  driver adapters, `reflect-metadata` en tests) para no volver a diagnosticarlos desde cero.
- **Decisión propia**: se mantiene fuera de git (se agregó `.claude/` al `.gitignore`) porque es
  una guía operativa pensada para el propio agente, no documentación del proyecto en sí — lo que
  otra persona necesita para levantar el proyecto ya está (o va a estar) en el README.
- **Pendiente de revisar**: —

### 2026-11-03 — Dataset de prueba multi-proveedor (AWS/Azure/GCP/on-prem)
- **Pedido**: generar un volumen generoso de logs de prueba, variados por "proveedor" (AWS,
  Azure, GCP, etc.), para verificar que la API y el schema soportan distintas formas de log sin
  tener que inventar datos a mano en cada prueba manual.
- **Aporte**: script (`.claude/dev-data/seed-dev-logs.mjs`, no versionado) que inserta ~4800 logs
  en 12 servicios simulados, cada proveedor con su propia forma de `metadata` (AWS:
  `requestId`/`logGroup`/`logStream`; Azure: `correlationId`/`resourceId`/`operationId`; GCP:
  `trace`/`spanId`/`resource`; on-prem: `host`/`pid`) y mensajes realistas por nivel (cold
  starts, throttling, timeouts, OOM, permisos denegados, etc.), con una ventana de "mala hora"
  por servicio para simular ráfagas de error en vez de solo ruido uniforme. Es idempotente: antes
  de insertar borra únicamente los logs de esos 12 servicios, sin tocar otros datos de prueba. Se
  usó para probar `GET /api/logs` contra datos heterogéneos reales, confirmando que el campo
  `metadata` (Json) soporta la variedad sin ningún cambio de schema.
- **Decisión propia**: se evaluó con el autor si subir esta herramienta al repositorio para
  mostrar el proceso de prueba con IA. Se decidió mantenerla fuera de git — es tooling de
  desarrollo generado por el agente, no el seed "realista" oficial de la Etapa 2 — y documentar
  el proceso acá en su lugar. Si más adelante conviene un dataset de prueba versionado y
  reproducible por cualquiera que clone el repo, se construye como `db/seed.ts` integrado al
  stack del proyecto (TypeScript, con sus propios tests), no como script suelto fuera de git.
- **Pendiente de revisar**: —

### 2026-11-03 — Promoción del seed a `db/seed.ts` (requisito del enunciado)
- **Pedido**: al revisar el PDF del desafío, se identificó que pide explícitamente "scripts de
  migración y seed con datos de ejemplo" y "al menos una consulta de agregación". Se decidió
  oficializar el dataset multi-proveedor (hasta ahora solo en `.claude/`, fuera de git) como el
  seed real del proyecto.
- **Aporte**: se portó la lógica de `seed-dev-logs.mjs` a `db/seed.ts` (TypeScript, tipado,
  dentro del repo) y se registró como seed oficial de Prisma vía `migrations.seed` en
  `prisma.config.ts` (campo nuevo de Prisma 7, verificado en los tipos instalados de
  `@prisma/config`) — así `npm run db:migrate:dev` lo corre automáticamente, y `npm run db:seed`
  (`prisma db seed`) permite re-ejecutarlo a mano. Se mantuvo la idempotencia ya probada (borra
  solo los logs de los 12 servicios que el propio script define antes de insertar) y se verificó
  corriéndolo dos veces seguidas sin que el total cambiara. Se sumó `db/` al alcance de `oxlint`
  y se confirmó `npm run build` en verde.
- **Decisión propia**: se dio de baja `.claude/dev-data/seed-dev-logs.mjs` (superado por
  `db/seed.ts`) y se actualizó `CLAUDE.md`: el seed de ejemplo se adelantó a la Etapa 1 (en vez de
  esperar a la Etapa 2) precisamente porque es un requisito explícito del enunciado, no una
  mejora interna.
- **Pendiente de revisar**: la consulta de agregación (`GET /api/logs/stats`, también requisito
  explícito del enunciado) todavía no está implementada — queda para la Etapa 2.

### 2026-11-03 — Consulta de agregación `GET /api/logs/stats`
- **Pedido**: releer el PDF del desafío para confirmar qué pide exactamente la consulta de
  agregación ("al menos una... por servicio, nivel o rango de fechas") y qué pide la sección de
  despliegue, e implementar la agregación según lo ya planeado en `CLAUDE.md`.
- **Aporte**: `GET /api/logs/stats?groupBy=service|level&from=&to=` vía `prisma.log.groupBy()`.
  Un solo `groupBy` por request (no combinado), `from`/`to` opcionales validados como ISO 8601
  (`class-validator`), y un `BadRequestException` manual si `from > to` (formateado igual que el
  resto de errores vía el filtro RFC 9457 ya existente). Para `groupBy=service` se resuelve el
  nombre del servicio con una segunda consulta (`service.findMany` por los IDs agrupados), ya que
  `groupBy` no hace join. Tests unitarios (niveles, servicios, rango inválido) + 2 casos e2e
  (`200` con datos agregados, `400` con `from > to`).
- **Decisión propia**: se agregaron las decisiones #19 y #20 a `ARCHITECTURE.md` (adelanto del
  seed a la Etapa 1, y el diseño de `groupBy` simple vs. combinado) — se habían tomado antes pero
  no estaban documentadas ahí todavía, solo en `docs/ai-usage.md`. Se confirmó además, releyendo
  el PDF, que la sección "05 Contenedores y despliegue" solo pide `Dockerfile` +
  `docker-compose.yml` locales — no pide desplegar a la nube — por lo que esa idea (ej. Google
  Cloud + Neon) se descarta del alcance de este desafío y queda anotada como posible extra si
  sobra tiempo.
- **Pendiente de revisar**: el bucketing por intervalo (`interval=hour|day`, para series de
  tiempo) quedó afuera de este alcance — es una mejora, no el requisito mínimo.

### 2026-11-03 — Bug encontrado: los tests e2e nunca estuvieron aislados de la base de dev
- **Pedido**: ninguno explícito — surgió corriendo `npm run test:e2e` como parte de la
  verificación de la nueva consulta de agregación.
- **Aporte**: el primer test e2e (`creates a log...`), que antes pasaba con 1 resultado, empezó a
  devolver 20 (el límite de paginación por defecto) apenas la base de dev tuvo más de 20 logs
  reales (después de sembrar el dataset multi-proveedor). Se investigó con logging temporal y se
  confirmó la causa: `ConfigModule.forRoot({ validate: validateEnv })` valida las env vars **al
  importar `AppModule`**, que ocurre antes de que el `beforeAll` del test llegue a pisar
  `process.env.DATABASE_URL` con la URL del contenedor de Testcontainers. Ese pisado "a tiempo"
  nunca tuvo efecto: los tests e2e estuvieron conectándose a la base de datos de desarrollo real
  desde que se escribieron (Etapa 1), y solo parecían pasar porque esa base estaba vacía la
  primera vez que corrieron. De paso se encontró que `AppController`/`AppService` (y sus specs)
  eran boilerplate del scaffold de `nest new`, nunca adaptado al proyecto real — se dieron de baja
  por ser código muerto.
- **Corregido**: en vez de depender del timing de `process.env`, el test ahora reemplaza el
  provider `PrismaService` con `overrideProvider(PrismaService).useValue(...)` — una instancia
  construida a mano, apuntada directamente a la URL del contenedor de Testcontainers. Es el
  patrón estándar de Nest para este caso y no depende de en qué momento Nest valida el entorno.
  Se verificó explícitamente que la corrida ya no toca la base de dev (el total vía `GET
  /api/logs` no cambió después de correr `npm run test:e2e`).
- **Pendiente de revisar**: ninguno — queda corregido y verificado, pero vale aclararlo en la
  entrevista como ejemplo de "qué pasa cuando algo falla" (un test en verde por las razones
  equivocadas es peor que un test que nunca se escribió).

### 2026-11-03 — Documentación de la API con `@nestjs/swagger`
- **Pedido**: el autor preguntó qué opción estándar hay en Nest para documentar la API (venía de
  usar Swagger/Swashbuckle en .NET) y pidió integrarla ya, para poder probar la app desde ahí en
  vez de solo con `curl`.
- **Aporte**: `@nestjs/swagger` (único camino serio en el ecosistema Nest), servido en `/docs`.
  Se habilitó el plugin del compilador (`nest-cli.json`, `classValidatorShim` +
  `introspectComments`) para que infiera los esquemas de los DTOs a partir de los decoradores de
  `class-validator` ya existentes, sin duplicar esa información a mano en cada campo. Se agregaron
  `@ApiTags`/`@ApiOperation` en el controller, y `@ApiQuery()` explícito para los parámetros de
  query (`page`/`limit`, `groupBy`/`from`/`to`), que el plugin no infiere solo. Se probó el ciclo
  completo desde la UI: `POST /api/logs` (201, log creado) → `GET /api/logs/stats?groupBy=service`
  (200, refleja el log recién creado).
- **Corregido**: al reiniciar el servidor de desarrollo para que tomara el plugin nuevo, el
  proceso anterior no liberó el puerto 3000 (quedó un proceso Node huérfano) — el servidor nuevo
  fallaba con `EADDRINUSE` y, mientras tanto, Swagger seguía sirviendo silenciosamente la versión
  vieja del código (por eso los `@ApiQuery` no aparecían al principio). Se identificó el PID real
  con `netstat`/`taskkill` y se confirmó la versión nueva después de matarlo.
- **Decisión propia**: documentada como decisión #22 en `ARCHITECTURE.md`. Se adelantó desde la
  Etapa 6 ("Cierre") a ahora, para tener documentación interactiva mientras se siguen sumando
  endpoints (LLM, análisis) en vez de documentar todo recién al final.
- **Pendiente de revisar**: ninguno.

### 2026-11-03 — Cola pg-boss: creación y verificación de pickup por worker
- **Pedido**: crear la infraestructura de la cola en Postgres y verificar que un worker toma los
  jobs, dejando la implementación real del análisis (LLM, persistencia, endpoints) para una vuelta
  aparte.
- **Aporte**: `pg-boss` instalado (versión estable verificada contra el registro de npm, igual
  cuidado que con Prisma). `src/queue/` con `QueueModule` (`@Global()`, mismo criterio que
  `DatabaseModule`), `PgBossService` (`extends PgBoss`, seguido el patrón exacto de
  `PrismaService`: inyecta `ConfigService`, `onModuleInit` arranca y crea la cola, `onModuleDestroy`
  la para) y la constante `ANALYSIS_QUEUE`. Verificación real con `tests/queue.e2e-spec.ts`: un
  test contra Postgres efímero (Testcontainers) que manda un job y confirma que un worker
  registrado lo recibe con el payload correcto.
- **Corregido**: el build inicial de `PgBossService` fallaba al resolver su dependencia en el
  test e2e de logs (`Nest can't resolve dependencies of the PgBossService`) porque el `ConfigService`
  se había importado con `import type` en vez de `import` — con tipos borrados en compilación, Nest
  no tiene la referencia en runtime para inferir qué inyectar por tipo. Se corrigió comparando
  contra el import real de `PrismaService` (que sí usa `import` normal para lo mismo).
- **Decisión propia**: documentada como decisión #23 en `ARCHITECTURE.md` — no registrar ningún
  `.work()` en código de la aplicación en esta vuelta (la verificación vive solo en el test, contra
  una base efímera que nunca toca la base real), para no dejar un handler "de prueba" que después
  compita en silencio con el worker real de la Etapa 4 si no se borra a tiempo. Se verificó además
  a mano que `pg-boss` crea su propio schema (`pgboss`) en la base de dev real al arrancar
  (`npm run start:dev`), sin errores.
- **Pendiente de revisar**: la implementación real del análisis (worker, `LlmProvider`,
  persistencia de `Analysis`/`AnalysisFinding`, endpoints) queda para la próxima vuelta.

### 2026-11-04 — Worker real de análisis (Etapas 3 y 4): LLM aislado, cola con reintentos y endpoints
- **Pedido**: implementar la lógica real de análisis que la vuelta anterior dejó pendiente: la
  capa LLM aislada (interfaz, schema Zod, preprocesador de logs, mock) y el worker real que
  consume la cola, persiste resultados y expone `POST /api/logs/analyze` / `GET /api/analysis/:id`.
  Antes de escribir código se repasó en conversación qué significan "job" vs. "worker" en pg-boss,
  y se profundizó en tolerancia a fallas (reintentos, idempotencia) a pedido explícito del autor.
- **Aporte**: `zod` instalado (versión estable verificada contra el registro de npm, misma
  disciplina que con Prisma/pg-boss). `src/llm/` (capa aislada, sin dependencias de Nest/DB):
  `LlmProvider` (interfaz + `name` de solo lectura, para que el worker registre el proveedor sin
  confiar en lo que diga el propio LLM), `analysisResultSchema` (Zod), `LogPreprocessor`
  (enmascara y agrupa logs en patrones por servicio+nivel+mensaje normalizado, ordenados por
  severidad y frecuencia, acotados a `ANALYSIS_MAX_PATTERNS`), `prompt.ts`, `MockLlmProvider` con
  3 escenarios (éxito/formato inválido/timeout, este último con fake timers en los tests). `src/
  analysis/`: `AnalysisService` (valida rango, `ANALYSIS_MAX_RANGE_HOURS`, 422 sin logs),
  `AnalysisWorkerService` (el `.work()` real, con guard de idempotencia, timeout centralizado vía
  `Promise.race`, y el mapeo de los 3 códigos de error `LLM_*`), y los dos controllers. Se agregó
  `LogsService.findManyForAnalysis`/`countForAnalysis` (no existía ningún filtrado por rango
  todavía en `LogsService`, más allá de paginar). Política de reintentos explícita en
  `createQueue` (`retryLimit: 3`, `retryBackoff: true`, `expireInSeconds: 60`, verificada contra
  `node_modules/pg-boss/dist/types.d.ts` en vez de asumir los defaults). Antes de escribir el
  schema Zod y el worker se corrió un chequeo manual (`node -e`) contra la API real de Zod v4
  instalada, porque cambió bastante respecto a v3.
- **Corregido**: durante la implementación, el disco `C:` se quedó literalmente en 0 MB libres y
  `npm install` falló con `ENOSPC` — se avisó al autor en vez de borrar nada, y se retomó una vez
  liberó espacio. Al reiniciar la máquina para resolver eso, Docker Desktop quedó abajo y el
  contenedor `smartlog-analyzer-db-1` (Postgres de dev) se detuvo; al correr los e2e después del
  reinicio, `tests/logs.e2e-spec.ts` falló con `ECONNREFUSED` en el puerto 5432 — y ahí se encontró
  un bug real preexistente (de la vuelta de la cola, no de esta): ese test nunca pisaba
  `PgBossService` con `overrideProvider`, solo `PrismaService`. Pasaba en silencio porque
  `PgBossService` (sin pisar) terminaba conectándose a la Postgres real de dev en el puerto 5432,
  y esa Postgres resultaba estar arriba las veces que corrió antes — la misma clase de bug que la
  decisión #21, pero para la cola en vez de para Prisma. Se corrigió agregando el mismo
  `overrideProvider(PgBossService)` que ya usan `analysis.e2e-spec.ts` y el `queue.e2e-spec.ts`
  descartado. Por otro lado, ese mismo `tests/queue.e2e-spec.ts` registraba su
  propio `.work()` de prueba importando `AppModule` completo; al existir ahora `AnalysisWorkerService`
  registrado sobre la misma cola en ese mismo `AppModule`, ambos quedaban compitiendo por los
  mismos jobs — el escenario de doble consumidor que la decisión #23 había anticipado, ahora real.
  Se eliminó ese test: su propósito (¿algún worker toma un job?) quedó cubierto por
  `tests/analysis.e2e-spec.ts`, que prueba el worker real end-to-end.
- **Decisión propia**: documentada como decisión #24 en `ARCHITECTURE.md` — `finding_category`
  libre (guiada por prompt, no un enum cerrado en Zod), los 3 errores `LLM_*` se atrapan en el
  worker y no activan retry de pg-boss (ya son un resultado de negocio terminal), cualquier otro
  error se deja propagar para que pg-boss reintente, y el guard de idempotencia evita findings
  duplicados ante un reintento que llega después de un intento previo ya resuelto. El test e2e de
  reintento (`tests/analysis.e2e-spec.ts`) usa la política real de la cola de punta a punta (vía
  `POST /api/logs/analyze`), en vez de pasar opciones de reintento por job — más simple y más fiel
  a lo que corre en producción.
- **Pendiente de revisar**: `GeminiLlmProvider` (Etapa 5), con el reintento "con corrección" ante
  `LLM_INVALID_RESPONSE` anotado como idea en `.claude/notes/analysis-worker-flow.md` (fuera de
  git); confirmar con el autor si el worker debería loggear/alertar cuando se agotan los 3
  reintentos de pg-boss (hoy el `Analysis` queda silenciosamente en `processing`).
