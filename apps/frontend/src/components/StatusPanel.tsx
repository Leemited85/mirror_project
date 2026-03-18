import type { AppStatus } from '../types/fitting';

type StatusPanelProps = {
  status: AppStatus;
};

export function StatusPanel({ status }: StatusPanelProps) {
  return (
    <section className="panel status-panel">
      <h2>상태</h2>
      <dl>
        <dt>단계</dt>
        <dd>{status.phase}</dd>
        <dt>메시지</dt>
        <dd>{status.message}</dd>
        <dt>시간</dt>
        <dd>{status.lastUpdatedAt ? new Date(status.lastUpdatedAt).toLocaleTimeString() : '-'}</dd>
      </dl>
    </section>
  );
}
