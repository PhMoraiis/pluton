-- CreateEnum
CREATE TYPE "SeriesRole" AS ENUM ('NONE', 'SALARY');

-- CreateEnum
CREATE TYPE "TagSystem" AS ENUM ('SUBSCRIPTION');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "amountAdjusted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "role" "SeriesRole" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "system" "TagSystem",

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryTag" (
    "entryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "EntryTag_pkey" PRIMARY KEY ("entryId","tagId")
);

-- CreateTable
CREATE TABLE "SeriesTag" (
    "seriesId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "SeriesTag_pkey" PRIMARY KEY ("seriesId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_system_key" ON "Tag"("userId", "system");

-- CreateIndex
CREATE INDEX "EntryTag_tagId_idx" ON "EntryTag"("tagId");

-- CreateIndex
CREATE INDEX "SeriesTag_tagId_idx" ON "SeriesTag"("tagId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesTag" ADD CONSTRAINT "SeriesTag_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesTag" ADD CONSTRAINT "SeriesTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Etiqueta de sistema "Assinatura" para contas já existentes (contas novas: hook do Better Auth).
INSERT INTO "Tag" ("id", "userId", "name", "color", "sortOrder", "system")
SELECT gen_random_uuid()::text, u."id", 'Assinatura', '#D9730D', 0, 'SUBSCRIPTION'
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM "Tag" t WHERE t."userId" = u."id" AND t."system" = 'SUBSCRIPTION');
