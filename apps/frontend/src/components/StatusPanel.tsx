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
        <dd>{translatePhase(status.phase)}</dd>
        <dt>메시지</dt>
        <dd>{status.message}</dd>
        <dt>시간</dt>
        <dd>{status.lastUpdatedAt ? new Date(status.lastUpdatedAt).toLocaleTimeString() : '-'}</dd>
      </dl>
    </section>
  );
}

function translatePhase(phase: AppStatus['phase']) {
  const labels: Record<AppStatus['phase'], string> = {
    idle: '대기',
    'camera-ready': '카메라 준비',
    processing: '처리 중',
    fitting: '합성 중',
    ready: '완료',
    error: '오류'
  };

  return labels[phase];
}
