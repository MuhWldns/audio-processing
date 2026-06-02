# Readable Public IDs Design

Date: 2026-06-02

## Goal

Add short, meaningful, unique public IDs for user-facing and admin-facing records without replacing existing database primary keys.

Existing `id` fields remain internal CUID primary keys. New `publicId` fields provide readable identifiers for UI, invoices, support, admin search, and exported documents.

## Non-Goals

- Do not replace primary keys or foreign keys.
- Do not change existing route parameters in one large migration.
- Do not add public IDs to purely internal tables yet.
- Do not encode mutable status values into IDs.

## Format

Use this structure:

```text
PREFIX-CODE-YYMM-SEQUENCE
```

Example:

```text
PUR-COM-2606-000001
```

Meaning:

- `PUR`: record type, purchase.
- `COM`: stable business context, commercial license.
- `2606`: year/month created, June 2026.
- `000001`: sequence within that scope/month.

## Table Formats

| Table | Field | Format | Meaning |
| --- | --- | --- | --- |
| `User` | `publicId` | `ACC-IDN-2606-000001` | Account in Indonesia market |
| `TopUpOrder` | `publicId` | `TOP-IDR-2606-000001` | Top up order in IDR |
| `WalletTransaction` | `publicId` | `TXN-TOP-2606-000001` | Wallet transaction; code by transaction type |
| `Purchase` | `publicId` | `PUR-COM-2606-000001` | Purchase; code by license type |
| `License` | `publicId` | `LIC-COM-2606-000001` | License record; code by license type |
| `Product` | `publicId` | `PRD-SCR-2606-000001` | Product; code by product/category domain |
| `UploadRecord` | `publicId` | `UPL-WAV-2606-000001` | Upload/audio record; code by file format |
| `UsageEvent` | `publicId` | `USE-PAID-2606-000001` | Audio usage event; code by billing mode |

## Codes

### Wallet Transaction Codes

| Type | Code |
| --- | --- |
| `TOP_UP` | `TOP` |
| `PURCHASE` | `PUR` |
| `AUDIO_CHARGE` | `AUD` |
| `REFUND` | `REF` |
| `ADJUSTMENT` | `ADJ` |

### License Type Codes

| Type | Code |
| --- | --- |
| `PERSONAL` | `PER` |
| `COMMERCIAL` | `COM` |
| `ENTERPRISE` | `ENT` |

### Product Codes

Use category/domain when available:

| Domain | Code |
| --- | --- |
| Audio | `AUD` |
| Roblox | `RBX` |
| Script/default | `SCR` |

If category mapping is unknown, use `SCR`.

### Usage Codes

| Usage | Code |
| --- | --- |
| Free quota | `FREE` |
| Paid processing | `PAID` |

## Tables Excluded For Now

These tables keep CUID-only IDs unless future UI/support needs require public IDs:

- `OAuthAccount`
- `Session`
- `Cart`
- `CartItem`
- `ProductFile`
- `ProductImage`
- `ActivityLog`
- `GameWhitelist`
- `LicenseVerification`

Reason: these are internal/detail records, not primary customer support objects.

## Schema Changes

Add `publicId String @unique @db.VarChar(32)` to selected tables.

Add counter table:

```prisma
model PublicIdCounter {
  id         String   @id @default(cuid())
  scope      String   @unique @db.VarChar(32)
  nextNumber Int      @default(1)
  updatedAt  DateTime @updatedAt
}
```

`scope` is the ID prefix without sequence:

```text
ACC-IDN-2606
TOP-IDR-2606
PUR-COM-2606
LIC-COM-2606
```

Generated ID:

```text
scope + "-" + sequence.padStart(6, "0")
```

## Generation Rules

Generate public IDs inside the same Prisma transaction that creates the business record.

Sequence allocation must be atomic:

1. Determine `scope` from record type and stable business code.
2. Increment or create `PublicIdCounter` for that scope.
3. Format sequence as 6 digits.
4. Create record with generated `publicId`.
5. Rely on `@unique` as final safety net.

If unique collision occurs, retry generation once inside a new transaction. Collision should be rare if counter update is atomic.

## Data Flow

### Create User

1. OAuth callback creates user.
2. Generate `ACC-IDN-YYMM-NNNNNN`.
3. Store in `User.publicId`.
4. `/auth/me` returns both `id` and `publicId`.

### Create Top Up

1. User starts top up.
2. Generate `TOP-IDR-YYMM-NNNNNN`.
3. Store in `TopUpOrder.publicId`.
4. Display public ID in payment/status UI.

### Checkout

1. Checkout transaction creates `Purchase`, `License`, and `WalletTransaction`.
2. Generate `PUR-*`, `LIC-*`, and `TXN-*` in same transaction.
3. Keep `License.licenseKey` unchanged for Roblox runtime.
4. Invoice displays purchase/license public IDs plus license key.

### Audio Upload

1. Upload service creates `UsageEvent` and `UploadRecord`.
2. Generate `USE-*` and `UPL-*`.
3. History page displays upload public ID.

## API And UI Changes

Internal queries continue using CUID `id`.

Responses should include `publicId` for selected models. UI should prefer `publicId` for display, invoice, admin tables, and support references.

Admin search can later support `publicId` lookup. That is additive and does not need route changes.

## Migration Strategy

1. Add nullable `publicId` fields and `PublicIdCounter` table.
2. Backfill existing records with generated public IDs based on each record's `createdAt` month and business code.
3. Add unique indexes after backfill.
4. Make `publicId` required in Prisma schema.
5. Update create flows to generate public IDs.
6. Update API responses and UI display.

This staged migration avoids breaking existing data.

## Error Handling

- If generator fails, business record creation fails and transaction rolls back.
- If backfill finds conflicting public ID, increment sequence and continue.
- If public ID code cannot be derived, use safe default (`SCR` for product, `PAID` for usage when cost > 0, `FREE` otherwise).

## Testing

Add tests for:

- Format generation per record type.
- Counter sequence increments per scope.
- Different scopes have independent sequences.
- Concurrent creates do not duplicate public IDs.
- API responses include `publicId` where expected.
- Existing CUID `id` route behavior remains unchanged.

## Open Decisions

No open decisions. Approved style is short and tidy format with stable business context.
