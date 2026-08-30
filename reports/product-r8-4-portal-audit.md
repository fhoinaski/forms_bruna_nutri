# Product R8.4 — Patient portal audit

## Current portal and authorization

- Routes: `/portal` (login plus authenticated home), `/portal/minha-conta`, invite/reset/password routes.
- Every portal API derives the patient identity from `getClientPortalSessionFromRequest`; it does not accept a client id from the browser as authority.
- Logout, password rotation, revocation, and forced password change remain in the R8.3 domain.

## Reusable real domains

| Portal section | Existing source | Patient-safe contract |
| --- | --- | --- |
| Home / meal plan | `getActiveMealPlanDelivery` via `getClientPortalSummary` | Active delivery only; drafts are excluded. SIMPLE, OPTIONS, COMBINATION, linked recipes, and professionally approved substitutions are already represented. |
| Appointments | `appointments` / availability repository | Scoped to the session client and `portal_visible = 1`. |
| Tasks | `client_tasks` | Scoped to the session client; completion is authorized server-side. |
| Account | R8.3 patient auth | Session-scoped password change and logout. |
| Protocol/care content | `client_protocols`, nutrition record | Present in existing portal summary, but patient publication semantics need product review before broader presentation. |

## Publication gaps — stop condition

### Recommendations / orientations

`patient_education_cards` is a global catalogue with only `is_active`. It has no patient assignment, patient-visible state, release timestamp, or per-patient authorization relation. Existing nutrition-record fields are clinical records and do not carry an explicit patient-publication contract.

**Conclusion:** showing these as patient recommendations would either leak global/internal content or require an unsafe heuristic. Do not implement this portal section without an explicit publication model.

### Files / deliverables

No repository, storage contract, patient-file relation, signed-download route, or `patient_visible` authorization state exists for patient documents. Existing print/PDF routes are staff-oriented outputs, not an authorized patient-deliverable domain.

**Conclusion:** a Files section and file IDOR tests cannot be implemented safely with the present schema.

## Minimal schema decision required

`SCHEMA_GAP: yes`

Before R8.4 implementation can proceed, approve a minimal, additive patient-deliverables/publication contract covering:

1. patient-scoped orientation/material release records;
2. patient-scoped file metadata and authorization state; and
3. protected download delivery (or an approved existing storage contract).

No migration was created, no remote data was changed, and no clinical or meal-plan domain behavior was modified.
