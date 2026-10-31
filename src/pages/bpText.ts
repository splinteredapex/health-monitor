import type { ProtocolStatus } from '../domain/bp';
export const PROTOCOL_STATUS_TEXT: Record<ProtocolStatus, string> = {
  complete: '7-day protocol complete',
  minimum: 'NICE minimum met (≥4 days)',
  'in-progress': 'In progress – not yet formal',
  incomplete: 'Incomplete – not a formal average',
};
