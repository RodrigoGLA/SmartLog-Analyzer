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
