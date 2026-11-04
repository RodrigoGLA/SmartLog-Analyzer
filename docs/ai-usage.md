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

### 2026-11-04 — `GeminiLlmProvider` (Etapa 5): proveedor real detrás de la misma interfaz
- **Pedido**: el autor generó una API key de Gemini (Google AI Studio, capa gratuita) y la puso en
  su `.env`, y pidió planificar e implementar el proveedor real. Antes de escribir código, preguntó
  explícitamente qué forma tiene la respuesta del LLM (para entender el contrato) y pidió planear
  los tests — se usó `/plan` para esto: dos subagentes (`Explore` para relevar el estado exacto del
  código, `Plan` para diseñar la implementación) y una pregunta al autor sobre si implementar el
  reintento "con corrección" ahora (eligió diferirlo).
- **Aporte**: `src/llm/gemini-llm-provider.ts` — `fetch` nativo (decisión #13), autenticación por
  header `x-goog-api-key` (nunca en la URL), `responseSchema` de Gemini escrito a mano (ver
  decisión #25: `z.toJSONSchema()` no es compatible con el subset que acepta Gemini), timeout
  propio con `AbortSignal.timeout` (Node 26), y todo error normalizado a los 3 `LlmError` ya
  existentes para no disparar el retry de pg-boss por accidente (decisión #24, reafirmada para el
  proveedor real en la #25). `llm.module.ts` pasa a un `useFactory` que elige `MockLlmProvider` o
  `GeminiLlmProvider` según la nueva env var `LLM_PROVIDER` (default `mock`); `LLM_API_KEY` se
  vuelve obligatoria solo si `LLM_PROVIDER=gemini` (`@ValidateIf`). 11 tests unitarios con `fetch`
  mockeado (`vi.stubGlobal`): éxito, HTTP no-2xx, red caída, timeout/abort (los dos nombres de
  error reales de Node), contenido bloqueado, JSON malformado, body no-JSON, y la forma exacta del
  request (URL, header, prompts, `responseSchema`).
- **Corregido**: antes de escribir el código se hizo una llamada real a la API (con la key del
  autor, sin loguearla) para verificar el contrato vigente — misma disciplina que ya se usó para
  Zod/Prisma/pg-boss — y salió un hallazgo real: **`gemini-2.5-flash` (el default que ya estaba
  documentado) fue retirado por Google para API keys nuevas**, igual que `gemini-2.0-flash` y
  `gemini-2.5-flash-lite`; el mensaje de error de la propia API sugería `gemini-3.8-flash` o
  `gemini-3.5-flash-lite` como reemplazo. Se probaron varios nombres en vivo; `gemini-3.5-flash-lite`
  respondió con éxito, incluyendo la salida estructurada completa contra nuestro `responseSchema`
  (confirmado con un análisis real de ejemplo, no solo un "OK" de prueba) — se usó como nuevo
  default en `env.schema.ts`/`.env.example`. Durante la verificación manual de punta a punta
  (`POST /api/logs/analyze` → worker → Gemini → `GET /api/analysis/:id`) aparecieron dos problemas
  más, ninguno del código de la app: (1) la capa gratuita de ese modelo mostró latencia muy
  variable — desde ~1s hasta más de 20s para pedidos chicos — lo que hizo que los primeros dos
  intentos terminaran en `LLM_TIMEOUT` real (confirmando que ese camino de error funciona
  correctamente de punta a punta, aunque no era el objetivo de esa corrida); (2) al subir
  `LLM_TIMEOUT_MS` a mano en el `.env` local para una corrida con más margen, un `echo >> .env` se
  pegó sin salto de línea al final de `LLM_MODEL` (el archivo no terminaba con newline), generando
  silenciosamente un nombre de modelo inválido (`gemini-3.5-flash-liteLLM_TIMEOUT_MS=60000`) y un
  `400 INVALID_ARGUMENT` de Gemini — se detectó revisando el archivo con `cat -A`, se corrigió el
  salto de línea faltante, y una corrida posterior con el `.env` ya sano terminó en `completed` con
  hallazgos reales y coherentes (categorías libres como `dependency-failure`/`security`, severidad
  `CRITICAL` en los casos que correspondía).
- **Decisión propia**: documentada como decisión #25 en `ARCHITECTURE.md`. El default de código de
  `LLM_TIMEOUT_MS` queda en `20000` sin cambios (razonable para un tier de producción más estable);
  la variabilidad observada es específica de la capa gratuita de este modelo en este momento, no
  un problema del diseño — se documenta como una nota para quien reproduzca esto en desarrollo.
- **Pendiente de revisar**: el reintento "con corrección" ante `LLM_INVALID_RESPONSE` sigue
  anotado y diferido (confirmado explícitamente con el autor esta vuelta, no implementado).

### 2026-11-04 — Filtros en `GET /api/logs`, merge a `main`, e idea de notificación anotada
- **Pedido**: el autor pidió comitear y pushear el proveedor Gemini, mergear `develop` a `main` con
  un comentario sobre el estado del flujo mínimo e2e, anotar en el repo (visible en git, no en
  notas locales) la idea de notificar la finalización de un análisis (en vez de solo polling), y
  después seguir con los 3 puntos pendientes en orden de prioridad: filtros de `GET /api/logs`,
  health check, y el reintento "con corrección" del LLM. Antes de planificar los filtros, se releyó
  el PDF del desafío para confirmar qué pide exactamente — resultó que `GET /api/logs` "con
  filtros" está en la tabla de endpoints mínimos, no es un extra, y es un requisito distinto de la
  consulta de agregación (`GET /api/logs/stats`, ya resuelta). Se usó `/plan` de nuevo: un
  subagente `Explore` relevó el estado exacto del código y uno `Plan` diseñó la implementación.
- **Aporte**: `git merge --no-ff develop -m "..."` a `main` (sin conflictos, 17 commits de
  diferencia, nada divergente en `main`), con un mensaje describiendo el estado real (ingesta →
  cola → worker → LLM real → consulta, con pulido pendiente). Pusheado a `origin/main`. La idea de
  notificación quedó documentada como un nuevo ítem en `ARCHITECTURE.md` §8 ("Qué cambiaría en
  producción"): un webhook opcional (`callbackUrl` en `POST /api/logs/analyze`) como complemento al
  polling, con sus trade-offs frente a SSE/WebSocket. `GET /api/logs` ahora filtra por `service`
  (case-insensitive, vía el filtro de relación de Prisma `service: { name: {...} } }`), `level`
  (`@IsEnum(LogLevel)`), `from`/`to` (mismo patrón de validación que ya usaba `/stats`), y `search`
  (substring case-insensitive sobre `message`, vía `contains` + `mode: 'insensitive'`, que Prisma
  traduce a `ILIKE`). 8 tests unitarios nuevos en `logs.service.spec.ts` (cada filtro solo,
  combinados, cero resultados, `from > to` rechazado) y 2 nuevos en el e2e (un combo
  servicio+nivel de punta a punta, probando además la insensibilidad a mayúsculas con un query real
  `?service=PAYMENTS-API`, y el caso 400).
- **Corregido**: ninguno — el build/lint/unit/e2e completos pasaron a la primera.
- **Decisión propia**: documentada como decisión #26 en `ARCHITECTURE.md`. `service` matchea
  case-insensitive aunque `Service.name` es una unique key case-sensitive asignada por upsert
  exacto al ingestar (decisión #11) — son problemas distintos (ingesta vs. filtro de listado).
  `?search=` vacío se rechaza con 400 en vez de interpretarse como "sin filtro". `search` no tiene
  ningún índice detrás (no hay `ILIKE`/full-text en ningún otro lado del proyecto) — aceptable a
  esta escala, se agregó un ítem nuevo en §8 para un índice `pg_trgm`/GIN o mover la búsqueda a
  Elasticsearch en producción, mismo tratamiento que ya reciben la paginación por offset y el test
  de carga de la cola.
- **Pendiente de revisar**: health check (`GET /api/health`) y el reintento "con corrección" del
  LLM, en ese orden, según lo acordado con el autor.

### 2026-11-04 — `GET /api/health` con `@nestjs/terminus`
- **Pedido**: el autor pidió comitear/pushear el trabajo de filtros y seguir con el health check,
  preguntando primero qué es un health check (se le explicó en el chat: un endpoint que consultan
  sistemas automáticos — orquestadores, balanceadores, monitoreo — para saber si el servicio está
  sano, no una pantalla para una persona). Pidió explícitamente no planificar con `/plan` esta vez
  ("confío en tu criterio... solo cuando termines explicame el flujo"), así que se implementó
  directo sin pasar por modo plan.
- **Aporte**: `GET /api/health` vía `@nestjs/terminus` (`HealthModule`/`HealthController` en
  `src/health/`), usando el `PrismaHealthIndicator` ya incluido en el paquete (hace
  `$queryRawUnsafe('SELECT 1')` con timeout de 1s) contra `PrismaService` — no se escribió el ping
  a mano. `ProblemDetailsFilter` se extendió con un caso para la forma particular que usa el
  `HealthCheckResult` que lanza terminus (`status` + `details`, sin `message`/`error` como el resto
  de las `HttpException`), listando en `errors` qué indicador falló y por qué, para no perder esa
  información al envolverla en el mismo `application/problem+json` que ya usa toda la API. Tests:
  2 unitarios en `health.controller.spec.ts` (ok con la base arriba, `ServiceUnavailableException`
  con la base abajo, mockeando `PrismaService` pero compilando el módulo real de terminus) + 1 caso
  nuevo en `problem-details.filter.spec.ts` (mapea un `HealthCheckResult` de error a 503 con el
  detalle) + 1 e2e nuevo (`tests/health.e2e-spec.ts`, Testcontainers, camino feliz). Verificación
  manual además de los tests automatizados: con la app corriendo de verdad contra el Postgres de
  Docker, `GET /api/health` devolvió `200` con `status: 'up'`; deteniendo el contenedor
  (`docker stop`) con la app corriendo, el mismo endpoint devolvió `503` con
  `errors: ["database: ..."]` describiendo la falla real de conexión; al reiniciar el contenedor
  (`docker start`), sin reiniciar la app, volvió a `200` solo — confirmando que no hay estado
  cacheado entre chequeos.
- **Corregido**: el primer test unitario fallaba porque el mock de `PrismaService` solo tenía
  `$queryRawUnsafe` — `PrismaHealthIndicator.pingDb` prueba primero `$runCommandRaw` (su ping para
  Mongo) y solo cae a `$queryRawUnsafe` (el ping SQL) cuando ese primer intento lanza el error
  específico que un `PrismaClient` real sobre Postgres tira para ese método
  (`"Use the mongodb provider"`); el mock necesitaba simular también ese primer fallo para llegar
  al camino SQL, igual que lo hace un cliente real.
- **Decisión propia**: documentada como decisión #27 en `ARCHITECTURE.md`. Un solo indicador
  (Postgres, vía Prisma) — no se agrega uno aparte para pg-boss porque corre sobre la misma
  conexión, así que sería redundante. Se agregó también un ítem nuevo en `ARCHITECTURE.md` §8:
  separar *liveness* de *readiness* (y eventualmente sumar un ping al LLM) queda para producción,
  no para este desafío, que pide un único `GET /api/health`.
- **Pendiente de revisar**: el reintento "con corrección" del LLM ante `LLM_INVALID_RESPONSE`
  sigue como el último de los 3 puntos prioritarios acordados con el autor.

### 2026-11-04 — Reintento "con corrección" ante `LLM_INVALID_RESPONSE`
- **Pedido**: el autor pidió implementar el último de los 3 puntos prioritarios — la idea que
  había quedado anotada (y diferida) desde la Etapa 5: cuando el LLM devuelve algo que no cumple
  `analysisResultSchema`, reenviarle el prompt 1-2 veces con el error de validación antes de
  rendirse. Pidió un plan corto con una descripción y los casos a considerar para el retry (vía
  `/plan`), y de paso aclaró que, si testear el camino de reintento resultaba muy complejo (forzar
  al LLM real a fallar), se podía omitir esa cobertura. No hizo falta: todos los tests (unitarios y
  e2e) usan dobles controlados (`vi.fn()`/un provider de prueba con una función mutable) que
  simplemente devuelven primero una respuesta inválida y después una válida, sin tocar la API real
  — la "complejidad" que preocupaba no aplicaba.
- **Aporte**: `AnalysisWorkerService` ahora reintenta hasta `LLM_MAX_CORRECTION_RETRIES` veces
  (env var nueva, default `1`, tope `2`) solo cuando la respuesta del LLM es `LLM_INVALID_RESPONSE`
  (JSON que no cumple el schema, o ni siquiera es JSON) — `LlmTimeoutError`/`LlmProviderError`
  siguen terminales de inmediato, sin cambios. El contexto de corrección (`LlmCorrectionContext`:
  la respuesta anterior + el motivo del rechazo) se pasa como segundo parámetro opcional de
  `LlmProvider.analyze`, no dentro de `LlmAnalysisInput`. `GeminiLlmProvider` lo arma como un turno
  de chat real (`user` con el prompt original → `model` con la respuesta anterior → `user` con el
  pedido de corrección) en vez de concatenar todo en un string. `pg-boss.expireInSeconds` pasó de
  ser una constante fija (`60`) a calcularse a partir de `LLM_TIMEOUT_MS` y el tope de reintentos,
  para que una secuencia de reintentos legítima nunca choque con que pg-boss declare el job
  "colgado" y lo reintente él mismo en paralelo. Tests nuevos: `prompt.spec.ts` (nuevo),
  `gemini-llm-provider.spec.ts` (+1, la forma del turno multi-chat), `analysis-worker.service.
  spec.ts` (+4: reintenta y completa, agota reintentos y falla, `retries=0` no reintenta, el
  provider lanzando `LlmInvalidResponseError` directamente también reintenta), y 2 casos e2e
  nuevos en `tests/analysis.e2e-spec.ts` con el mismo double mutable que el archivo ya tenía.
- **Corregido**: dos cosas detectadas recién al correr los tests, no al escribir el código.
  (1) El `testConfig` falso que usan los 3 e2e specs (`logs`/`analysis`/`health`) ignoraba la
  clave pedida y siempre devolvía la connection string de Postgres — funcionaba porque
  `PgBossService` solo leía `DATABASE_URL` hasta ahora; al agregarle lectura de `LLM_TIMEOUT_MS`/
  `LLM_MAX_CORRECTION_RETRIES` para calcular `expireInSeconds`, esos valores llegaban como string
  (la URL) en vez de número, dando `NaN`. Se corrigió el double en los 3 archivos para responder
  según la clave pedida, con defaults razonables. (2) El primer intento del test e2e "agota
  reintentos" comparaba `result.errorCode` directo, pero `GET /api/analysis/:id` expone el error
  anidado como `result.error.code` (`analysis.service.ts`) — se corrigió la aserción.
- **Decisión propia**: documentada como decisión #28 en `ARCHITECTURE.md`.
- **Pendiente de revisar**: ninguno de los 3 puntos prioritarios queda pendiente. Sigue para
  después (Etapa 6, sin apuro): README, Dockerfile de la app, `docker-compose.yml` final.

### 2026-11-04 — Documentar en Swagger el shape de error de cada endpoint
- **Pedido**: probando `GET /api/health` a mano (parando el container de Postgres), el autor notó
  que Swagger documentaba el 200 pero no decía nada del 503 real — y preguntó si eso estaba bien
  documentado. Se le explicó que el código era correcto (el 503 real pasa por `ProblemDetailsFilter`,
  no por el shape nativo de terminus — decisión #27) pero que Swagger nunca reflejaba ese shape de
  error, ni en `/health` ni en ningún otro endpoint del proyecto (ninguno tenía `@ApiResponse` para
  sus errores). El autor pidió agregarlo.
- **Aporte**: `ProblemDetailsDto` nuevo (`src/common/dto/problem-details.dto.ts`), con el mismo
  shape que ya arma `ProblemDetailsFilter`. Se agregó `@ApiResponse({status, type: ProblemDetailsDto})`
  por cada error real que puede devolver cada controller: 400 en `POST/GET /api/logs`,
  `GET /api/logs/stats` y `POST /api/logs/analyze` (validación o `from`/`to` invertido); 422 en
  `POST /api/logs/analyze` (rango demasiado grande, o sin logs); 400/404 en `GET /api/analysis/:id`
  (uuid inválido / no existe); 503 en `GET /api/health`.
- **Corregido**: en `/api/health`, agregar `@ApiResponse(503, ...)` junto al `@HealthCheck()` de
  terminus no alcanzaba — `@HealthCheck()` ya agrega su propia documentación Swagger para 200/503
  (con el shape nativo `status`/`info`/`error`/`details`), y Nest mergea ambos `@ApiResponse` del
  mismo status en vez de reemplazar uno por el otro, dejando un schema inconsistente (ambos
  superpuestos). Se verificó esto leyendo `node_modules/@nestjs/terminus/dist/health-check/health-check.decorator.js`
  y comparando `GET /docs-json` antes/después. Se resolvió con `@HealthCheck({ swaggerDocumentation: false })`
  para apagar esa documentación automática y describir las dos respuestas (200 y 503) a mano.
  Verificado levantando la app en un puerto aparte (sin tocar el proceso que el autor tenía
  corriendo) y confirmando en `/docs` que el 503 de `/api/health` y los 400/404/422 del resto ya
  muestran `ProblemDetailsDto`.
- **Decisión propia**: documentada como decisión #29 en `ARCHITECTURE.md`.
- **Pendiente de revisar**: ninguno. Sigue para después (Etapa 6, sin apuro): README ya en
  `develop`; falta Dockerfile de la app y `docker-compose.yml` final.
