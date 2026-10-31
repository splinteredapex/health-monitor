import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportBackup } from '../db/backup';
import { downloadText } from './download';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Local console only – no telemetry is ever sent.
    console.error('UI error', error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-2xl border border-danger/40 bg-danger-bg p-4 text-text">
        <h2 className="text-lg font-semibold text-danger">Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}</h2>
        <p className="mt-1 text-sm">Your saved records are not affected. You can try again, or download a backup first.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="min-h-11 rounded-xl bg-primary px-4 font-medium text-on-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button type="button" className="min-h-11 rounded-xl border border-border bg-surface px-4 font-medium" onClick={() => window.location.reload()}>Reload app</button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-border bg-surface px-4 font-medium"
            onClick={async () => downloadText(`health-recovery-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')}
          >
            Download backup
          </button>
        </div>
      </div>
    );
  }
}
