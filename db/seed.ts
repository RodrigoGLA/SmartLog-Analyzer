import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
type Provider = 'aws' | 'azure' | 'gcp' | 'onprem';

interface ServiceSeed {
  name: string;
  provider: Provider;
}

interface SeedLog {
  serviceId: number;
  level: Level;
  message: string;
  timestamp: Date;
  traceId: string | null;
  metadata: Prisma.InputJsonValue | null;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const LOGS_PER_SERVICE = 400;
const SPREAD_DAYS = 14;
const LEVEL_WEIGHTS: Record<Level, number> = { DEBUG: 20, INFO: 55, WARN: 15, ERROR: 8, FATAL: 2 };

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hex(bytes: number): string {
  return Array.from({ length: bytes }, () => randomInt(0, 15).toString(16)).join('');
}

function randomTimestampWithinDays(days: number): Date {
  const now = Date.now();
  const offsetMs = randomInt(0, days * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs);
}

function weightedLevel(weights: Record<Level, number>): Level {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [level, weight] of Object.entries(weights) as [Level, number][]) {
    if (roll < weight) return level;
    roll -= weight;
  }
  return 'INFO';
}

const AWS_REGIONS = ['us-east-1', 'us-west-2', 'sa-east-1'];
const AZURE_REGIONS = ['eastus', 'westeurope', 'brazilsouth'];
const GCP_REGIONS = ['us-central1', 'southamerica-east1', 'europe-west1'];

const MESSAGES: Record<Provider, Record<Level, string[]>> = {
  aws: {
    DEBUG: [
      'Cold start initialized in 142ms',
      'Fetched config from SSM parameter store',
      'Cache miss for key order:48213, querying DynamoDB',
      'X-Ray subsegment closed: downstream-call',
    ],
    INFO: [
      'Lambda invocation succeeded in 231ms',
      'Order processed successfully',
      'API Gateway request completed with status 200',
      'Message published to SNS topic order-events',
    ],
    WARN: [
      'Lambda duration approaching timeout threshold (9500ms of 10000ms)',
      'DynamoDB request throttled, retrying with backoff',
      'Deprecated API version used by client',
      'SQS message received after visibility timeout, reprocessing',
    ],
    ERROR: [
      'Payment gateway timeout after 3 retries',
      'Unhandled exception in handler: TypeError: Cannot read properties of undefined',
      'DynamoDB ProvisionedThroughputExceededException',
      'S3 PutObject failed: AccessDenied',
    ],
    FATAL: [
      'Lambda out of memory: process exited with signal SIGKILL',
      'RDS Proxy connection pool exhausted, service unresponsive',
    ],
  },
  azure: {
    DEBUG: [
      'Function trigger activated by HTTP request',
      'Retrieved secret from Key Vault',
      'Dependency call to Cosmos DB completed in 18ms',
      'Durable function orchestration checkpoint saved',
    ],
    INFO: [
      'Notification sent successfully to subscriber',
      'Order status updated in Cosmos DB',
      'Health check endpoint returned 200 OK',
      'Service Bus message processed successfully',
    ],
    WARN: [
      'Cosmos DB request rate limited (429), retrying',
      'App Service instance approaching CPU threshold (85%)',
      'Slow dependency call detected: 4200ms',
      'Durable function retry policy triggered',
    ],
    ERROR: [
      'Unhandled exception in HTTP trigger: NullReferenceException',
      'Service Bus message processing failed after 5 attempts',
      'Cosmos DB connection timeout',
      'Managed identity token acquisition failed',
    ],
    FATAL: [
      'App Service instance restarted unexpectedly (OOM)',
      'AKS pod evicted due to memory pressure',
    ],
  },
  gcp: {
    DEBUG: [
      'Cloud Run instance started, cold start 310ms',
      'Pub/Sub message acknowledged',
      'Firestore read completed in 22ms',
      'Trace span closed: downstream-call',
    ],
    INFO: [
      'Cloud Run request completed with status 200',
      'Pub/Sub message published to topic orders.created',
      'Recommendation generated for user',
      'Health check endpoint returned 200 OK',
    ],
    WARN: [
      'Cloud Run container approaching memory limit (480MB of 512MB)',
      'Firestore write contention detected, retrying',
      'Pub/Sub message redelivered after ack deadline exceeded',
      'Autoscaler increased instance count due to CPU pressure',
    ],
    ERROR: [
      'Unhandled exception: google.api_core.exceptions.DeadlineExceeded',
      'Cloud Run instance crashed with exit code 137',
      'Firestore permission denied for service account',
      'BigQuery streaming insert failed: quota exceeded',
    ],
    FATAL: ['GKE node NotReady, pods evicted', 'Cloud SQL connection pool exhausted, service unavailable'],
  },
  onprem: {
    DEBUG: [
      'Connection pool checked out connection #14',
      'Parsed request body (212 bytes)',
      'Cache hit for session token',
      'Scheduled job enqueued: nightly-reconciliation',
    ],
    INFO: [
      'User logged in successfully',
      'Nightly batch job completed: 4213 records processed',
      'Health check OK',
      'Cache warmed for product catalog',
    ],
    WARN: [
      'Disk usage on /var/log at 82%',
      'Slow query detected (1.8s): SELECT * FROM invoices',
      'Connection pool exhausted, queuing request',
      'Retrying failed webhook delivery (attempt 2 of 3)',
    ],
    ERROR: [
      'Unhandled exception in request handler: NullPointerException',
      'Failed to connect to legacy SOAP billing service',
      'Deadlock detected, transaction rolled back',
      'Webhook delivery failed after 3 attempts',
    ],
    FATAL: ['Out of memory, JVM heap exhausted', 'Disk full, unable to write to log file'],
  },
};

function buildMetadata(provider: Provider): Prisma.InputJsonValue {
  switch (provider) {
    case 'aws':
      return {
        provider: 'aws',
        awsRegion: pick(AWS_REGIONS),
        requestId: randomUUID(),
        logGroup: '/aws/lambda/checkout',
        logStream: `2026/11/03/[$LATEST]${hex(16)}`,
        coldStart: Math.random() < 0.1,
      };
    case 'azure':
      return {
        provider: 'azure',
        region: pick(AZURE_REGIONS),
        operationId: hex(16),
        correlationId: randomUUID(),
        resourceId: `/subscriptions/${hex(8)}/resourceGroups/smartlog/providers/Microsoft.Web`,
      };
    case 'gcp':
      return {
        provider: 'gcp',
        region: pick(GCP_REGIONS),
        trace: `projects/smartlog/traces/${hex(32)}`,
        spanId: hex(16),
        resource: { type: 'cloud_run_revision', labels: { service_name: 'smartlog-svc' } },
      };
    case 'onprem':
      return { host: `app-${randomInt(1, 6)}.internal`, pid: randomInt(1000, 9999) };
  }
}

function traceIdFor(provider: Provider, metadata: Prisma.InputJsonValue): string | null {
  if (Math.random() < 0.3) return null; // no todos los logs vienen con trace
  const meta = metadata as Record<string, unknown>;
  switch (provider) {
    case 'aws':
      return meta.requestId as string;
    case 'azure':
      return meta.correlationId as string;
    case 'gcp':
      return meta.trace as string;
    case 'onprem':
      return `trace-${hex(12)}`;
  }
}

const SERVICES: ServiceSeed[] = [
  { name: 'aws-lambda-checkout', provider: 'aws' },
  { name: 'aws-ecs-payments-api', provider: 'aws' },
  { name: 'aws-apigateway-orders', provider: 'aws' },
  { name: 'azure-functions-notifications', provider: 'azure' },
  { name: 'azure-appservice-inventory', provider: 'azure' },
  { name: 'azure-aks-shipping', provider: 'azure' },
  { name: 'gcp-cloudrun-search', provider: 'gcp' },
  { name: 'gcp-gke-recommendations', provider: 'gcp' },
  { name: 'gcp-pubsub-order-events', provider: 'gcp' },
  { name: 'onprem-nginx-gateway', provider: 'onprem' },
  { name: 'onprem-legacy-billing', provider: 'onprem' },
  { name: 'onprem-batch-reconciliation', provider: 'onprem' },
];

interface IncidentWindow {
  start: Date;
  end: Date;
}

// Una "mala hora" por servicio: una ventana de 1-2hs con más ERROR/FATAL de lo normal,
// para que también haya ráfagas realistas y no solo ruido uniforme.
function buildIncidentWindow(): IncidentWindow {
  const start = randomTimestampWithinDays(SPREAD_DAYS);
  const end = new Date(start.getTime() + randomInt(60, 120) * 60 * 1000);
  return { start, end };
}

function levelForTimestamp(ts: Date, incident: IncidentWindow): Level {
  if (ts >= incident.start && ts <= incident.end && Math.random() < 0.6) {
    return Math.random() < 0.3 ? 'FATAL' : 'ERROR';
  }
  return weightedLevel(LEVEL_WEIGHTS);
}

function buildLogsForService(serviceId: number, provider: Provider): SeedLog[] {
  const incident = buildIncidentWindow();
  const logs: SeedLog[] = [];
  for (let i = 0; i < LOGS_PER_SERVICE; i++) {
    const timestamp = randomTimestampWithinDays(SPREAD_DAYS);
    const level = levelForTimestamp(timestamp, incident);
    const metadata = buildMetadata(provider);
    logs.push({
      serviceId,
      level,
      message: pick(MESSAGES[provider][level]),
      timestamp,
      traceId: traceIdFor(provider, metadata),
      metadata,
    });
  }
  return logs;
}

function chunk<T>(array: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const serviceNames = SERVICES.map((s) => s.name);

  console.log(`Limpiando logs previos de ${serviceNames.length} servicios de ejemplo...`);
  await prisma.log.deleteMany({ where: { service: { name: { in: serviceNames } } } });

  const serviceIds: Record<string, number> = {};
  for (const { name } of SERVICES) {
    const service = await prisma.service.upsert({ where: { name }, create: { name }, update: {} });
    serviceIds[name] = service.id;
  }

  let totalInserted = 0;
  for (const { name, provider } of SERVICES) {
    const logs = buildLogsForService(serviceIds[name] as number, provider);
    for (const batch of chunk(logs, 200)) {
      await prisma.log.createMany({ data: batch });
    }
    totalInserted += logs.length;
    console.log(`  ${name} (${provider}): ${logs.length} logs`);
  }

  console.log(`Listo: ${totalInserted} logs insertados en ${SERVICES.length} servicios.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
