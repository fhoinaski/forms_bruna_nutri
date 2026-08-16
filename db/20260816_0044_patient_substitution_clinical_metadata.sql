-- Add safe structured metadata for patient food substitution observability.
-- No raw patient message, clinical text, or encrypted clinical evidence is stored here.
ALTER TABLE patient_food_substitution_events ADD COLUMN clinical_metadata_json TEXT NULL;
