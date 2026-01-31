-- AlterTable
ALTER TABLE "Theme" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Theme_userId_idx" ON "Theme"("userId");

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
