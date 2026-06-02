# Readable Public IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add short, meaningful, unique `publicId` values for selected business records while keeping existing CUID primary keys and routes stable.

**Architecture:** Keep `id` as internal primary key. Add a focused `publicIdService` that generates `PREFIX-CODE-YYMM-SEQUENCE` values through a transactional `PublicIdCounter` model. Create flows call the service inside existing Prisma transactions, API responses include `publicId`, and UI displays `publicId` where users/admins need readable references.

**Tech Stack:** Node/Bun ESM backend, Express controllers, Prisma MySQL schema, Vitest tests, Next/React frontend.

---

## File Structure

- Create: `backend/src/services/publicIdService.js` - all public ID code mapping and generator logic.
- Create: `backend/tests/services/publicIdService.test.js` - unit tests for scope/code/format generation.
- Modify: `backend/tests/helpers/mockPrisma.js` - add `publicIdCounter` mock model and `updateMany` helper.
- Modify: `backend/prisma/schema.prisma` - add `PublicIdCounter` model and nullable `publicId` fields for staged migration.
- Create: Prisma-generated migration folder named like `backend/prisma/migrations/20260602123456_add_public_ids/migration.sql` - SQL migration for counter table and nullable unique public IDs.
- Modify: `backend/src/services/authService.js` - generate `User.publicId` on new OAuth user; expose in `buildMePayload`.
- Modify: `backend/src/controllers/topupController.js` - generate `TopUpOrder.publicId`, include in responses.
- Modify: `backend/src/controllers/checkoutController.js` - generate `Purchase.publicId`, `License.publicId`, `WalletTransaction.publicId`, include in checkout response.
- Modify: `backend/src/services/uploadService.js` - generate `UsageEvent.publicId`, `UploadRecord.publicId`, and audio wallet transaction public IDs.
- Modify: `backend/src/controllers/productController.js` and `backend/src/controllers/adminController.js` - include/generate product public IDs in product APIs/admin create.
- Modify: frontend pages that display account, transactions, checkout success, licenses, topup/history to prefer `publicId`.

---

### Task 1: Public ID Service

**Files:**
- Create: `backend/src/services/publicIdService.js`
- Create: `backend/tests/services/publicIdService.test.js`
- Modify: `backend/tests/helpers/mockPrisma.js`

- [ ] **Step 1: Add mock Prisma support**

Modify `backend/tests/helpers/mockPrisma.js` so `createMockModel()` includes `updateMany`, and add `publicIdCounter`.

```js
function createMockModel() {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "mock-id" }),
    update: vi.fn().mockResolvedValue({ id: "mock-id" }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({ id: "mock-id" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: "mock-id" }),
  };
}
```

Add to `mockPrisma`:

```js
publicIdCounter: createMockModel(),
```

- [ ] **Step 2: Write failing public ID service tests**

Create `backend/tests/services/publicIdService.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPrisma, resetAllMocks } from "../helpers/mockPrisma.js";
import {
  buildPublicIdScope,
  generatePublicId,
  getLicenseTypeCode,
  getProductDomainCode,
  getTransactionTypeCode,
  getUsageBillingCode,
} from "../../src/services/publicIdService.js";

describe("publicIdService", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T10:00:00.000Z"));
  });

  it("maps transaction types to short codes", () => {
    expect(getTransactionTypeCode("TOP_UP")).toBe("TOP");
    expect(getTransactionTypeCode("PURCHASE")).toBe("PUR");
    expect(getTransactionTypeCode("AUDIO_CHARGE")).toBe("AUD");
    expect(getTransactionTypeCode("REFUND")).toBe("REF");
    expect(getTransactionTypeCode("ADJUSTMENT")).toBe("ADJ");
  });

  it("maps license types to short codes", () => {
    expect(getLicenseTypeCode("PERSONAL")).toBe("PER");
    expect(getLicenseTypeCode("COMMERCIAL")).toBe("COM");
    expect(getLicenseTypeCode("ENTERPRISE")).toBe("ENT");
  });

  it("maps product domains from category hints", () => {
    expect(getProductDomainCode("audio-tools")).toBe("AUD");
    expect(getProductDomainCode("roblox-scripts")).toBe("RBX");
    expect(getProductDomainCode(null)).toBe("SCR");
  });

  it("maps usage billing mode from cost", () => {
    expect(getUsageBillingCode(0)).toBe("FREE");
    expect(getUsageBillingCode(2000)).toBe("PAID");
  });

  it("builds scope with YYMM", () => {
    expect(buildPublicIdScope("PUR", "COM", new Date())).toBe("PUR-COM-2606");
  });

  it("generates public ID from existing counter", async () => {
    mockPrisma.publicIdCounter.upsert.mockResolvedValue({ scope: "PUR-COM-2606", nextNumber: 8 });

    await expect(generatePublicId(mockPrisma, "PUR", "COM")).resolves.toBe("PUR-COM-2606-000007");
    expect(mockPrisma.publicIdCounter.upsert).toHaveBeenCalledWith({
      where: { scope: "PUR-COM-2606" },
      create: { scope: "PUR-COM-2606", nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/services/publicIdService.test.js`

Expected: FAIL because `backend/src/services/publicIdService.js` does not exist.

- [ ] **Step 4: Implement public ID service**

Create `backend/src/services/publicIdService.js`:

```js
const DEFAULT_SEQUENCE_WIDTH = 6;

export function getYearMonth(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function getTransactionTypeCode(type) {
  const codes = {
    TOP_UP: "TOP",
    PURCHASE: "PUR",
    AUDIO_CHARGE: "AUD",
    REFUND: "REF",
    ADJUSTMENT: "ADJ",
  };
  return codes[type] || "ADJ";
}

export function getLicenseTypeCode(type) {
  const codes = {
    PERSONAL: "PER",
    COMMERCIAL: "COM",
    ENTERPRISE: "ENT",
  };
  return codes[type] || "PER";
}

export function getProductDomainCode(categorySlugOrName) {
  const value = String(categorySlugOrName || "").toLowerCase();
  if (value.includes("audio")) return "AUD";
  if (value.includes("roblox") || value.includes("rbx")) return "RBX";
  return "SCR";
}

export function getUsageBillingCode(costRupiah) {
  return Number(costRupiah || 0) > 0 ? "PAID" : "FREE";
}

export function buildPublicIdScope(prefix, code, date = new Date()) {
  return `${prefix}-${code}-${getYearMonth(date)}`;
}

export async function generatePublicId(tx, prefix, code, date = new Date()) {
  const scope = buildPublicIdScope(prefix, code, date);
  const counter = await tx.publicIdCounter.upsert({
    where: { scope },
    create: { scope, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  const sequence = counter.nextNumber - 1;
  return `${scope}-${String(sequence).padStart(DEFAULT_SEQUENCE_WIDTH, "0")}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/services/publicIdService.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/services/publicIdService.js backend/tests/services/publicIdService.test.js backend/tests/helpers/mockPrisma.js
git commit -m "feat: add public id generator"
```

---

### Task 2: Prisma Schema And Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: Prisma-generated migration folder named like `backend/prisma/migrations/20260602123456_add_public_ids/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add this model near the wallet section or before selected models:

```prisma
model PublicIdCounter {
  id         String   @id @default(cuid())
  scope      String   @unique @db.VarChar(32)
  nextNumber Int      @default(1)
  updatedAt  DateTime @updatedAt
}
```

Add nullable `publicId` fields for staged migration:

```prisma
publicId String? @unique @db.VarChar(32)
```

Add to these models:

- `User` after `id`.
- `WalletTransaction` after `id`.
- `TopUpOrder` after `id`.
- `UsageEvent` after `id`.
- `UploadRecord` after `id`.
- `Product` after `id`.
- `License` after `id`.
- `Purchase` after `id`.

- [ ] **Step 2: Generate migration**

Run: `bunx prisma migrate dev --name add_public_ids --create-only`

Expected: migration folder created under `backend/prisma/migrations`.

- [ ] **Step 3: Verify migration SQL shape**

Open generated `migration.sql`. It must contain:

```sql
CREATE TABLE `PublicIdCounter`
```

and `ALTER TABLE` statements adding nullable `publicId` columns plus unique indexes.

- [ ] **Step 4: Generate Prisma client**

Run: `bunx prisma generate`

Expected: Prisma client generated successfully.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add public id schema"
```

---

### Task 3: User Public IDs

**Files:**
- Modify: `backend/src/services/authService.js`
- Test: existing auth tests under `backend/tests/routes/auth.test.js`

- [ ] **Step 1: Write failing expectations**

In auth tests for new OAuth user creation and `/auth/me`, expect `publicId` to be present.

Example expectation:

```js
expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "ACC-IDN-2606-000001" }),
}));
expect(res.body.user.publicId).toBeDefined();
```

Mock counter:

```js
prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "ACC-IDN-2606", nextNumber: 2 });
```

- [ ] **Step 2: Run auth tests to verify failure**

Run: `bun test tests/routes/auth.test.js`

Expected: FAIL because `publicId` is not generated/returned.

- [ ] **Step 3: Generate `User.publicId` in user creation**

Import in `backend/src/services/authService.js`:

```js
import { generatePublicId } from "./publicIdService.js";
```

Where new user is created, wrap generation and create in transaction if not already transactional:

```js
const createdUser = await prisma.$transaction(async (tx) => {
  const publicId = await generatePublicId(tx, "ACC", "IDN");
  return tx.user.create({
    data: {
      publicId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      lastLoginAt: new Date(),
      lastLoginProvider: provider,
    },
  });
});
```

Adapt field names to existing profile object in that file.

- [ ] **Step 4: Return `publicId` in user payload**

Where user response selects/builds fields, include:

```js
publicId: true
```

and payload:

```js
publicId: user.publicId,
```

- [ ] **Step 5: Run auth tests**

Run: `bun test tests/routes/auth.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/services/authService.js backend/tests/routes/auth.test.js
git commit -m "feat: add account public ids"
```

---

### Task 4: Payment And Checkout Public IDs

**Files:**
- Modify: `backend/src/controllers/topupController.js`
- Modify: `backend/src/controllers/checkoutController.js`
- Modify: `backend/tests/routes/topup.test.js`
- Modify: `backend/tests/routes/checkout.test.js`

- [ ] **Step 1: Write topup failing expectations**

In topup create test, mock:

```js
prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "TOP-IDR-2606", nextNumber: 2 });
```

Expect create data:

```js
expect(prisma.topUpOrder.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "TOP-IDR-2606-000001" }),
}));
```

Expect response:

```js
expect(res.body.order.publicId).toBe("TOP-IDR-2606-000001");
```

- [ ] **Step 2: Write checkout failing expectations**

In checkout success test, mock sequential counters:

```js
prisma.publicIdCounter.upsert
  .mockResolvedValueOnce({ scope: "PUR-PER-2606", nextNumber: 2 })
  .mockResolvedValueOnce({ scope: "LIC-PER-2606", nextNumber: 2 })
  .mockResolvedValueOnce({ scope: "TXN-PUR-2606", nextNumber: 2 });
```

Expect create payloads:

```js
expect(prisma.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "PUR-PER-2606-000001" }),
}));
expect(prisma.license.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "LIC-PER-2606-000001" }),
}));
expect(prisma.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "TXN-PUR-2606-000001" }),
}));
```

- [ ] **Step 3: Run tests to verify failure**

Run: `bun test tests/routes/topup.test.js tests/routes/checkout.test.js`

Expected: FAIL because public IDs are not generated.

- [ ] **Step 4: Implement topup generation**

Import in `backend/src/controllers/topupController.js`:

```js
import { generatePublicId } from "../services/publicIdService.js";
```

Before creating `TopUpOrder` inside creation handler:

```js
const result = await prisma.$transaction(async (tx) => {
  const publicId = await generatePublicId(tx, "TOP", "IDR");
  return tx.topUpOrder.create({
    data: {
      publicId,
      userId: req.user.id,
      provider: PROVIDER_NAME,
      amountRupiah: amount,
      externalId: invoiceId,
      metadata: providerPayload,
    },
  });
});
```

Preserve existing fields and response shape. Add `publicId` to response object.

- [ ] **Step 5: Implement checkout generation**

Import in `backend/src/controllers/checkoutController.js`:

```js
import { generatePublicId, getLicenseTypeCode } from "../services/publicIdService.js";
```

Inside checkout transaction, before each create:

```js
const licenseTypeCode = getLicenseTypeCode(item.licenseType);
const purchasePublicId = await generatePublicId(tx, "PUR", licenseTypeCode);
const licensePublicId = await generatePublicId(tx, "LIC", licenseTypeCode);
const transactionPublicId = await generatePublicId(tx, "TXN", "PUR");
```

Add to create data:

```js
publicId: purchasePublicId,
```

```js
publicId: licensePublicId,
```

```js
publicId: transactionPublicId,
```

Add public IDs to checkout response license/purchase objects.

- [ ] **Step 6: Run tests**

Run: `bun test tests/routes/topup.test.js tests/routes/checkout.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/controllers/topupController.js backend/src/controllers/checkoutController.js backend/tests/routes/topup.test.js backend/tests/routes/checkout.test.js
git commit -m "feat: add payment public ids"
```

---

### Task 5: Product And Audio Public IDs

**Files:**
- Modify: `backend/src/controllers/adminController.js`
- Modify: `backend/src/controllers/productController.js`
- Modify: `backend/src/services/uploadService.js`
- Modify: matching route/service tests

- [ ] **Step 1: Write failing tests for product create/list**

In product admin create test, mock:

```js
prisma.publicIdCounter.upsert.mockResolvedValue({ scope: "PRD-SCR-2606", nextNumber: 2 });
```

Expect:

```js
expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ publicId: "PRD-SCR-2606-000001" }),
}));
```

In product list/detail tests, seed mock products with `publicId` and expect response `publicId`.

- [ ] **Step 2: Write failing tests for audio upload records**

In upload service/controller tests, mock:

```js
prisma.publicIdCounter.upsert
  .mockResolvedValueOnce({ scope: "USE-FREE-2606", nextNumber: 2 })
  .mockResolvedValueOnce({ scope: "UPL-WAV-2606", nextNumber: 2 });
```

Expect `usageEvent.create` and `uploadRecord.create` include generated `publicId`.

- [ ] **Step 3: Run tests to verify failure**

Run: `bun test tests/routes/products.test.js tests/routes/upload.test.js`

If no upload test file exists, run product tests only now and add upload coverage in step 4.

Expected: FAIL where assertions reference public IDs.

- [ ] **Step 4: Implement product public IDs**

Import in `backend/src/controllers/adminController.js`:

```js
import { generatePublicId, getProductDomainCode } from "../services/publicIdService.js";
```

When creating product:

```js
const productPublicId = await generatePublicId(prisma, "PRD", getProductDomainCode(category?.slug || category?.name));
```

Use transaction if category lookup and product create need shared `tx`:

```js
const product = await prisma.$transaction(async (tx) => {
  const category = categoryId
    ? await tx.productCategory.findUnique({ where: { id: categoryId }, select: { slug: true, name: true } })
    : null;
  const publicId = await generatePublicId(tx, "PRD", getProductDomainCode(category?.slug || category?.name));
  return tx.product.create({ data: { publicId, ...productData } });
});
```

Add `publicId` to product API responses in `productController.js` and admin product response mapping.

- [ ] **Step 5: Implement audio public IDs**

Import in `backend/src/services/uploadService.js`:

```js
import { generatePublicId, getUsageBillingCode } from "./publicIdService.js";
```

Inside existing upload transaction:

```js
const usagePublicId = await generatePublicId(tx, "USE", getUsageBillingCode(costRupiah));
const uploadPublicId = await generatePublicId(tx, "UPL", String(fileFormat || "BIN").toUpperCase().slice(0, 3));
```

Add to create data:

```js
publicId: usagePublicId,
```

and:

```js
publicId: uploadPublicId,
```

For audio charge wallet transaction, generate:

```js
const transactionPublicId = await generatePublicId(tx, "TXN", "AUD");
```

- [ ] **Step 6: Run tests**

Run: `bun test tests/routes/products.test.js tests/routes/history.test.js tests/routes/upload.test.js`

If a listed test file does not exist, run available matching tests and `bun test`.

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/controllers/adminController.js backend/src/controllers/productController.js backend/src/services/uploadService.js backend/tests
git commit -m "feat: add product and audio public ids"
```

---

### Task 6: API Response Coverage And Frontend Display

**Files:**
- Modify: `backend/src/controllers/userController.js`
- Modify: `backend/src/controllers/licenseController.js`
- Modify: `backend/src/controllers/historyController.js`
- Modify: `frontend/app/profile/page.tsx`
- Modify: `frontend/app/dashboard/wallet/page.tsx`
- Modify: `frontend/app/dashboard/transactions/page.tsx`
- Modify: `frontend/app/store/checkout/success/page.tsx`
- Modify: `frontend/app/dashboard/licenses/page.tsx`
- Modify: `frontend/app/audio/history/page.tsx`
- Modify: `frontend/components/Invoice.tsx` if needed

- [ ] **Step 1: Update backend response selects/maps**

Include `publicId` in selected response payloads:

```js
publicId: record.publicId,
```

Apply to:

- User transaction responses.
- Wallet/dashboard transaction responses.
- License list/detail responses.
- Upload history responses.
- Checkout success responses.
- Product list/detail/admin responses.

- [ ] **Step 2: Update frontend types**

For each affected page type, add optional fallback-safe public ID:

```ts
publicId?: string | null;
```

- [ ] **Step 3: Update frontend display with fallback**

Use:

```tsx
{item.publicId || item.id}
```

For license display, keep `licenseKey` visible where Roblox runtime key is needed. Use `publicId` as record label.

Checkout invoice ID should use:

```tsx
invoiceId: result.purchases[0]?.publicId || `INV-${result.purchases[0]?.id?.slice(0, 8) || 'unknown'}`,
```

- [ ] **Step 4: Run frontend checks**

Run: `bun install` if dependencies are missing, then from `frontend` run `bun run lint` if script exists.

If no lint script exists, run: `bunx tsc --noEmit`

Expected: no type errors.

- [ ] **Step 5: Run backend tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/controllers frontend
git commit -m "feat: display public ids"
```

---

### Task 7: Backfill Script And Final Hardening

**Files:**
- Create: `backend/scripts/backfill-public-ids.js`
- Modify: `backend/package.json`
- Modify: `backend/prisma/schema.prisma` after backfill strategy is verified

- [ ] **Step 1: Create backfill script**

Create `backend/scripts/backfill-public-ids.js`:

```js
import { prisma } from "../src/prisma.js";
import {
  generatePublicId,
  getLicenseTypeCode,
  getProductDomainCode,
  getTransactionTypeCode,
  getUsageBillingCode,
} from "../src/services/publicIdService.js";

async function backfillModel(modelName, getScopeParts, include = undefined) {
  const model = prisma[modelName];
  const rows = await model.findMany({
    where: { publicId: null },
    orderBy: { createdAt: "asc" },
    ...(include ? { include } : {}),
  });

  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      const [prefix, code] = getScopeParts(row);
      const publicId = await generatePublicId(tx, prefix, code, row.createdAt || new Date());
      await tx[modelName].update({ where: { id: row.id }, data: { publicId } });
    });
  }

  console.log(`${modelName}: ${rows.length} rows backfilled`);
}

async function main() {
  await backfillModel("user", () => ["ACC", "IDN"]);
  await backfillModel("topUpOrder", () => ["TOP", "IDR"]);
  await backfillModel("walletTransaction", (row) => ["TXN", getTransactionTypeCode(row.type)]);
  await backfillModel("purchase", (row) => ["PUR", getLicenseTypeCode(row.licenseType)]);
  await backfillModel("license", (row) => ["LIC", getLicenseTypeCode(row.licenseType)]);
  await backfillModel("product", (row) => ["PRD", getProductDomainCode(row.category?.slug || row.category?.name)], {
    category: { select: { slug: true, name: true } },
  });
  await backfillModel("usageEvent", (row) => ["USE", getUsageBillingCode(row.costRupiah)]);
  await backfillModel("uploadRecord", (row) => ["UPL", String(row.fileFormat || "BIN").toUpperCase().slice(0, 3)]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add package script**

Modify `backend/package.json` scripts:

```json
"backfill:public-ids": "bun scripts/backfill-public-ids.js"
```

- [ ] **Step 3: Run tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 4: Decide final non-null migration timing**

Do not make `publicId` required until production/staging backfill has run successfully. After backfill, create a second migration changing selected `publicId` columns to `NOT NULL`.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/scripts/backfill-public-ids.js backend/package.json backend/prisma/schema.prisma
git commit -m "chore: add public id backfill"
```

---

### Task 8: Full Verification

**Files:**
- No source files expected unless verification reveals failures.

- [ ] **Step 1: Run backend full tests**

Run from `backend`: `bun test`

Expected: PASS.

- [ ] **Step 2: Run Prisma validation**

Run from `backend`: `bunx prisma validate`

Expected: Prisma schema valid.

- [ ] **Step 3: Run frontend type/lint check**

Run from `frontend`: `bunx tsc --noEmit`

Expected: no type errors.

- [ ] **Step 4: Review generated diff**

Run: `git diff --stat`

Expected: only public ID related files changed.

- [ ] **Step 5: Final commit if needed**

If verification required fixes, commit them:

```bash
git status --short
git add backend frontend docs/superpowers
git commit -m "fix: complete public id rollout"
```

---

## Self-Review Notes

- Spec coverage: plan covers format, selected tables, excluded tables, counter strategy, generation in create flows, API/UI display, migration/backfill, error handling, and tests.
- Placeholder scan: no placeholder instructions remain. Migration folder name is intentionally generated by Prisma at execution time.
- Type consistency: uses `publicId`, `PublicIdCounter`, `scope`, `nextNumber`, and service function names consistently across tasks.
