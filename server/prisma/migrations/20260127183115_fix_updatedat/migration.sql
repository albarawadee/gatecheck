-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Guest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partyId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "seatNumber" INTEGER,
    "inviteNumber" TEXT,
    "tripleName" TEXT,
    "partySize" INTEGER,
    "memberIndex" INTEGER,
    "checkinToken" TEXT NOT NULL,
    "qrPayload" TEXT,
    "qrFile" TEXT,
    "checkedInAt" DATETIME,
    "checkedInById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guest_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Guest_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Guest" ("checkedInAt", "checkedInById", "checkinToken", "createdAt", "guestName", "id", "inviteNumber", "memberIndex", "partyId", "partySize", "qrFile", "qrPayload", "seatNumber", "tripleName", "updatedAt") SELECT "checkedInAt", "checkedInById", "checkinToken", "createdAt", "guestName", "id", "inviteNumber", "memberIndex", "partyId", "partySize", "qrFile", "qrPayload", "seatNumber", "tripleName", "updatedAt" FROM "Guest";
DROP TABLE "Guest";
ALTER TABLE "new_Guest" RENAME TO "Guest";
CREATE UNIQUE INDEX "Guest_checkinToken_key" ON "Guest"("checkinToken");
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seatNumber" INTEGER,
    "inviteNumber" TEXT,
    "partySize" INTEGER,
    "tripleName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Party" ("createdAt", "id", "inviteNumber", "partySize", "seatNumber", "tripleName", "updatedAt") SELECT "createdAt", "id", "inviteNumber", "partySize", "seatNumber", "tripleName", "updatedAt" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "passwordHash", "role") SELECT "createdAt", "email", "id", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
