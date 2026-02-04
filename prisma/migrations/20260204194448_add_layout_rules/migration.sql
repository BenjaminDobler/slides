-- CreateTable
CREATE TABLE "LayoutRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "conditions" TEXT NOT NULL,
    "transform" TEXT NOT NULL,
    "cssContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LayoutRule_name_key" ON "LayoutRule"("name");

-- CreateIndex
CREATE INDEX "LayoutRule_userId_idx" ON "LayoutRule"("userId");

-- CreateIndex
CREATE INDEX "LayoutRule_priority_idx" ON "LayoutRule"("priority");

-- AddForeignKey
ALTER TABLE "LayoutRule" ADD CONSTRAINT "LayoutRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
