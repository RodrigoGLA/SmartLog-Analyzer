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
