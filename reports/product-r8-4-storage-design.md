# Product R8.4 — private patient-file storage design

## Scope and authorization boundary

Patient files use one private Cloudflare R2 binding named `PATIENT_FILES_BUCKET`. The application stores only an internal, generated `object_key`; it never persists, returns, or relies on a public bucket URL, public domain, or permanent signed URL.

This implementation does not create a bucket, alter remote bindings, apply a remote migration, or write production objects. Those operations remain explicit deployment work outside this change.

## Delivery contract

The professional uploads with `POST /api/admin/clients/:patientId/files`. The request requires an admin session, verifies the patient, accepts only PDF/JPEG/PNG/WEBP up to 10 MiB, stores under a generated patient-specific key, and creates metadata in `patient_files` as `PRIVATE`.

The patient may download only through `GET /api/portal/files/:fileId/download`. That route derives the patient identity from the server-side portal session and looks up a `PUBLISHED` metadata record constrained by both `fileId` and `patient_id` before reading the private R2 object. The object key is never sent to the browser. Responses are streamed with `Cache-Control: private, no-store` and `Content-Disposition: attachment`.

Metadata insertion follows object storage. If the database write fails, the object deletion is attempted immediately so an unreferenced upload is not retained. A missing private object does not expose metadata or another patient's object; it returns 404.

## Runtime and test adapter

`lib/storage/patient-files.ts` is the sole storage contract. Production requires the private runtime binding to be made available as `PATIENT_FILES_BUCKET`; missing configuration fails closed. The in-memory adapter is injectable only while `NODE_ENV=test` and cannot be enabled in production code paths.

## Publication model

Files are `PRIVATE` on upload and become visible only after an explicit admin `PUBLISHED` transition. They can be `REVOKED`; listing and download queries accept only `PUBLISHED` content owned by the session patient. Orientations follow the same explicit publication pattern, with content snapshots preserved at creation so later edits to the global education catalog do not rewrite material already delivered.
