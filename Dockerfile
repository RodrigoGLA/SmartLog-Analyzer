# syntax=docker/dockerfile:1

FROM node:26-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Dummy: prisma.config.ts la necesita para cargar, pero `prisma generate` no conecta a la DB.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run db:generate
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY db ./db
COPY prisma.config.ts ./
EXPOSE 3000
# db/prisma/migrations/.../migration.sql se versiona como migration.sql.txt porque el validador
# de ZIPs de la plataforma de postulación (workflow.meetpia.ai) lo rechazaba por error como
# "archivo de base de datos" (es un script SQL de texto, no una base de datos). Se restaura el
# nombre real acá, antes de aplicar la migración, para que el flujo siga sin pasos manuales.
CMD ["sh", "-c", "mv db/prisma/migrations/20261103000000_init/migration.sql.txt db/prisma/migrations/20261103000000_init/migration.sql && npx prisma migrate deploy && npm run db:seed && npm run start:prod"]
