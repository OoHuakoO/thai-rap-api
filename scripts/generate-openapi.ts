import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { ERROR_CODES } from '../src/common/constants/error-codes.const';

const OUTPUT = join(__dirname, '..', '..', 'openapi.yaml');

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// The OpenAPI document is plain JSON, so a serializer for that subset is enough —
// it keeps this script free of a YAML dependency the API itself never needs.
const YAML_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;
const YAML_KEYWORD = /^(y|n|yes|no|true|false|on|off|null|~)$/i;
const NUMBER_LIKE = /^[+-]?(\d[\d_]*)(\.\d*)?([eE][+-]?\d+)?$/;

function isPlain(value: string): boolean {
  if (value === '' || value !== value.trim()) return false;
  if (YAML_INDICATOR.test(value) || YAML_KEYWORD.test(value)) return false;
  // A number-like string must stay quoted or it round-trips as a number.
  if (NUMBER_LIKE.test(value)) return false;
  // ": " opens a mapping and " #" opens a comment mid-scalar; a trailing ":" too.
  return !value.includes(': ') && !value.includes(' #') && !value.endsWith(':');
}

function scalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value !== 'string') return String(value);
  return isPlain(value) ? value : JSON.stringify(value);
}

function emit(value: Json, indent: number): string {
  const pad = '  '.repeat(indent);

  if (typeof value === 'string' && value.includes('\n')) {
    const body = value
      .replace(/\n+$/, '')
      .split('\n')
      .map((line) => (line ? `${pad}  ${line}` : ''))
      .join('\n');
    return `|-\n${body}`;
  }

  if (value === null || typeof value !== 'object') return scalar(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        const rendered = emit(item, indent + 1);
        return item !== null && typeof item === 'object' && !Array.isArray(item)
          ? `${pad}- ${rendered.replace(/^\s+/, '')}`
          : `${pad}- ${rendered}`;
      })
      .join('\n');
  }

  // DocumentBuilder leaves explicit `undefined` on some optional keys; JSON.stringify
  // drops them, so the YAML has to as well or the two stop round-tripping.
  const entries = Object.entries(value).filter(([, child]) => child !== undefined);
  if (entries.length === 0) return '{}';
  return entries
    .map(([key, child]) => {
      const rendered = emit(child as Json, indent + 1);
      // A non-empty collection renders as its own indented lines; scalars and the
      // empty "{}" / "[]" forms stay on the key's line.
      const isBlock =
        child !== null && typeof child === 'object' && rendered !== '{}' && rendered !== '[]';
      return isBlock
        ? `${pad}${scalar(key)}:\n${rendered}`
        : `${pad}${scalar(key)}: ${rendered}`;
    })
    .join('\n');
}

function errorCodes(): string {
  const lines: string[] = [];
  for (const [domain, group] of Object.entries(ERROR_CODES)) {
    const codes = Object.values(group as Record<string, string>).join(', ');
    lines.push(`- **${domain}** — ${codes}`);
  }
  return lines.join('\n');
}

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const apiVersion = process.env.API_VERSION ?? '1';
  // The prefix stays on the server URL rather than setGlobalPrefix, so the paths
  // below read the same as the strings in the web app's service files.
  const basePath = `/${apiPrefix}/v${apiVersion}`;

  const config = new DocumentBuilder()
    .setTitle('Thai RAP API')
    .setDescription(
      [
        'Thai Restaurant Acceleration Program — REST API.',
        '',
        'GENERATED FILE — produced from the NestJS controllers by `npm run openapi`.',
        'Do not hand-edit: change the controller or DTO and regenerate.',
        '',
        '## Response envelope',
        '',
        'Success responses are wrapped by TransformInterceptor:',
        '`{ "success": true, "data": <payload> }` — the schema each operation documents is the `data` payload.',
        '',
        'Failures are wrapped by GlobalExceptionFilter:',
        '`{ "success": false, "error": { "code": "<CODE>", "message": "<message>", "details"?: [] } }`',
        '',
        '## Error codes',
        '',
        errorCodes(),
      ].join('\n'),
    )
    .setVersion('1.0')
    .addServer(`http://localhost:3000${basePath}`, 'Local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from POST /auth/login',
      },
      'bearerAuth',
    )
    .addTag('Auth', 'Authentication, registration, and password reset')
    .addTag('Users', 'User management — SUPER_ADMIN only')
    .addTag('Stores', 'Store profiles, documents, and photos')
    .addTag('Assessment', 'Dimensions, assessments (T0–T4), scores, and evidence')
    .addTag('Analytics', 'Per-store analytics — radar, trend, action plans')
    .addTag('Dashboard', 'Project-level KPIs, charts, and activity feed')
    .addTag('Reports', 'Per-store round and overview reports')
    .addTag('News', 'Announcements — ADMIN / SUPER_ADMIN only')
    .addTag('Master Data', 'Provinces and store types')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await app.close();

  const { openapi, info, servers, tags, security, paths, components } =
    document as unknown as Record<string, unknown>;
  const ordered = { openapi, info, servers, tags, security, paths, components };

  writeFileSync(OUTPUT, `${emit(ordered as unknown as Json, 0)}\n`, 'utf8');

  const operations = Object.values(document.paths).reduce(
    (total, item) => total + Object.keys(item as object).length,
    0,
  );
  process.stdout.write(
    `openapi.yaml — ${Object.keys(document.paths).length} paths, ${operations} operations\n`,
  );
}

generate().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
