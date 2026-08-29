# Product R8.3 — E2E stability follow-up

## Copilot R5 timeout

- Failing assertion in the full matrix: `changeset: regenerar só o Almoço mostra o diff correto e aplica sem tocar o plano original`, waiting for **Usar plano anterior como base**.
- The same spec passed alone with one worker and again beside its R5/R1.2.6 neighbours using four workers.
- The full-matrix trace had no failed request or browser-console failure; it exhausted the test's 30-second UI budget before the element was observed.
- Classification: `RESOURCE_STARVATION`. It is not a reproducible Copilot behaviour regression. No product or test timeout change was made.

## R3 household-portion collision

- Failing assertion in the full matrix: creation of `TACO/129`, description `porção padrão`, returned HTTP 409 because Desktop and Mobile inserted the same global row concurrently.
- The affected spec passed alone (10/10). The cross-project matrix reproduced the shared-row condition.
- Fix: the test fixture is now named `porção padrão E2E R3`, is read first, accepts only the legitimate concurrent 201/409 insert race, and polls for the required persisted 105g row before running the UI assertion.
- Classification: `PARALLEL_INSERT_COLLISION`. The canonical portion repository and substitution engine were not changed.
