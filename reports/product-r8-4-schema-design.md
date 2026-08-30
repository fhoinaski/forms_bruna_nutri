# Product R8.4 — schema design decision

## Confirmed publication model

The approved minimum design is additive and uses two patient-scoped relations:

1. `patient_education_publications`: `id`, `patient_id`, `education_card_id`, explicit `status` (`DRAFT`, `PUBLISHED`, `REVOKED`), publication/audit timestamps and publisher, plus a minimal content snapshot.
2. `patient_files`: `id`, `patient_id`, internal `object_key`, original filename, MIME type, byte size, explicit `status` (`PRIVATE`, `PUBLISHED`, `REVOKED`), publication/audit timestamps and publisher.

Migration `db/20260829_0073_patient_portal_deliverables.sql` implements this model. Its indexes cover `(patient_id, status)` and the card/client foreign-key lookups. Defaults are non-published. No existing patient receives a publication or file from the migration.

## Snapshot decision

`patient_education_cards` is editable through current admin APIs. A publication without a snapshot would silently change material already delivered to a patient. The minimum safe snapshot is the delivered title, category, summary, and `sections_json`; this preserves the historical patient-visible content without adding a second global catalog or a broad versioning system.

## Storage decision

The repository contained no storage abstraction before R8.4. The approved private R2 contract is now isolated in `lib/storage/patient-files.ts`, with the single `PATIENT_FILES_BUCKET` binding and a test-only in-memory injection seam. There are no public URLs or permanent links.

The patient download route is server-side scoped to the authenticated portal session and streams from R2 only after a `PUBLISHED` record for that same patient is found. Remote migration application, bucket creation, binding provisioning, and production writes remain out of scope for this local implementation.
