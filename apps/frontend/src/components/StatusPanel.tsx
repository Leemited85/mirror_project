import type { AppStatus } from '../types/fitting';

type StatusPanelProps = {
  status: AppStatus;
};

export function StatusPanel({ status }: StatusPanelProps) {
  return (
    <section className="panel status-panel">
      <h2>Status</h2>
      <dl>
        <dt>Phase</dt>
        <dd>{status.phase}</dd>
        <dt>Message</dt>
        <dd>{status.message}</dd>
        <dt>Updated</dt>
        <dd>{status.lastUpdatedAt ? new Date(status.lastUpdatedAt).toLocaleTimeString() : '—'}</dd>
      </dl>
    </section>
  );
}
