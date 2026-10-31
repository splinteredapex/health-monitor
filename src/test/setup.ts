// Deterministic UK time zone so DST edge cases are exercised (BST ↔ GMT).
process.env.TZ = 'Europe/London';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
