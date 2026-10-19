import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

type Row = Record<string, unknown>;
type SqliteExport = Record<'User' | 'Room' | 'RoomAccess' | 'RoomJoinRequest' | 'Friendship' | 'File', Row[]>;

const exportPath = process.argv[2] ?? 'collab-export.json';
const prisma = new PrismaClient();

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const raw = String(value);
  const normalized = raw.includes('T') || raw.endsWith('Z') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid exported date: ${raw}`);
  return parsed;
}

function withDates(row: Row, fields: string[]): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    fields.includes(key) && value !== null ? asDate(value) : value,
  ]));
}

async function main() {
  const exported = JSON.parse(await readFile(exportPath, 'utf8')) as SqliteExport;
  const current = await Promise.all([
    prisma.user.count(),
    prisma.room.count(),
    prisma.roomAccess.count(),
    prisma.roomJoinRequest.count(),
    prisma.friendship.count(),
    prisma.file.count(),
  ]);
  if (current.some((count) => count !== 0)) {
    throw new Error('Import stopped: the PostgreSQL database is not empty. Use a fresh database to avoid overwriting data.');
  }

  await prisma.$transaction(async (tx) => {
    if (exported.User.length) await tx.user.createMany({ data: exported.User.map((row) => withDates(row, ['createdAt'])) as never });
    if (exported.Room.length) await tx.room.createMany({ data: exported.Room.map((row) => withDates(row, ['createdAt'])) as never });
    if (exported.RoomAccess.length) await tx.roomAccess.createMany({ data: exported.RoomAccess.map((row) => withDates(row, ['createdAt'])) as never });
    if (exported.RoomJoinRequest.length) await tx.roomJoinRequest.createMany({ data: exported.RoomJoinRequest.map((row) => withDates(row, ['createdAt', 'updatedAt'])) as never });
    if (exported.Friendship.length) await tx.friendship.createMany({ data: exported.Friendship.map((row) => withDates(row, ['createdAt'])) as never });
    if (exported.File.length) {
      await tx.file.createMany({
        data: exported.File.map((row) => {
          const normalized = withDates(row, ['createdAt', 'updatedAt']);
          const binary = normalized.crdtBinary as { __base64__?: string } | null;
          normalized.crdtBinary = binary && typeof binary.__base64__ === 'string'
            ? Buffer.from(binary.__base64__, 'base64')
            : null;
          return normalized;
        }) as never,
      });
    }
  });

  console.log(`Imported ${Object.values(exported).reduce((total, rows) => total + rows.length, 0)} rows from ${exportPath}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
