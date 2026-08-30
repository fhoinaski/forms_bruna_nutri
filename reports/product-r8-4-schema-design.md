# Product R8.4 — schema design decision

## Confirmed publication model

The approved minimum design is additive and uses two patient-scoped relations:

1. `patient_education_publications`: `id`, `patient_id`, `education_card_id`, explicit `status` (`DRAFT`, `PUBLISHED`, `REVOKED`), publication/audit timestamps and publisher, plus a minimal content snapshot.
2. `patient_files`: `id`, `patient_id`, internal `object_key`, original filename, MIME type, byte size, explicit `status` (`PRIVATE`, `PUBLISHED`, `REVOKED`), publication/audit timestamps and publisher.

Indexes would cover `(patient_id, status)` and the card/client foreign-key lookups. Defaults would be non-published. No existing patient would receive a publication or file from the migration.

## Snapshot decision

`patient_education_cards` is editable through current admin APIs. A publication without a snapshot would silently change material already delivered to a patient. The minimum safe snapshot is the delivered title, category, summary, and `sections_json`; this preserves the historical patient-visible content without adding a second global catalog or a broad versioning system.

## Blocking storage decision

The repository contains **no existing storage abstraction**: no R2 binding, Drive adapter, bucket client, upload route, signed URL helper, or protected object-streaming service. There is therefore no existing contract that can implement the required authorized `GET /api/portal/files/:id/download` route.

Creating a provider, bucket convention, or signing system would be a new storage domain, which is prohibited by the R8.4 instruction to reuse existing infrastructure and not create parallel storage.

## Required decision before migration/implementation

Choose the approved storage contract for `patient_files`:

- Cloudflare R2 with server-side signed/streamed delivery; or
- an existing Drive/storage integration to be connected; or
- another explicitly approved managed provider and authorization contract.

After that decision, one additive migration can be created with the exact `object_key` semantics and a protected patient download route. Until then, creating metadata that cannot safely receive or deliver an object would be an incomplete and misleading feature.

No migration was created, no remote schema was changed, and no production data was written.
