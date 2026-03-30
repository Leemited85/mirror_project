import type { AppStatus, GarmentAsset, ProviderStatus } from '../types/fitting';

type StatusPanelProps = {
  status: AppStatus;
  providerStatus: ProviderStatus | null;
  cameraLabel: string | null;
  isOrbbecMatched: boolean;
  selectedGarment: GarmentAsset | null;
};

export function StatusPanel({
  status,
  providerStatus,
  cameraLabel,
  isOrbbecMatched,
  selectedGarment
}: StatusPanelProps) {
  return (
    <section className="panel status-panel">
      <h2>System Status</h2>
      <dl>
        <dt>Phase</dt>
        <dd>{translatePhase(status.phase)}</dd>
        <dt>Message</dt>
        <dd>{status.message}</dd>
        <dt>Updated</dt>
        <dd>{status.lastUpdatedAt ? new Date(status.lastUpdatedAt).toLocaleTimeString() : '-'}</dd>
        <dt>Camera</dt>
        <dd>{cameraLabel ?? 'No active camera'}</dd>
        <dt>Orbbec</dt>
        <dd>{cameraLabel ? (isOrbbecMatched ? 'Matched Orbbec/Astro label' : 'No Orbbec label match') : 'Unknown'}</dd>
        <dt>Garment</dt>
        <dd>{selectedGarment ? selectedGarment.name : 'No garment selected'}</dd>
        <dt>Pose</dt>
        <dd>{providerStatus ? providerStatus.pose_provider : 'Unknown'}</dd>
        <dt>VTON</dt>
        <dd>{providerStatus ? providerStatus.vton_provider : 'Unknown'}</dd>
        <dt>VTON status</dt>
        <dd>{buildVtonStatus(providerStatus)}</dd>
      </dl>
    </section>
  );
}

function translatePhase(phase: AppStatus['phase']) {
  const labels: Record<AppStatus['phase'], string> = {
    idle: 'Idle',
    'camera-ready': 'Camera ready',
    processing: 'Processing garment',
    fitting: 'Running synthesis',
    capturing: 'Saving result',
    ready: 'Ready',
    error: 'Error'
  };

  return labels[phase];
}

function buildVtonStatus(providerStatus: ProviderStatus | null) {
  if (!providerStatus) {
    return 'Unavailable';
  }
  if (providerStatus.vton_provider === 'comfyui') {
    if (providerStatus.comfyui_message) {
      return providerStatus.comfyui_message;
    }
    return providerStatus.comfyui_ready ? 'Ready' : 'Needs setup';
  }

  if (providerStatus.vton_provider === 'idm-vton') {
    if (providerStatus.idm_vton_message) {
      return providerStatus.idm_vton_auth_configured
        ? `${providerStatus.idm_vton_message} Auth configured.`
        : providerStatus.idm_vton_message;
    }
    return 'IDM-VTON selected. Set IDM_VTON_ENDPOINT_URL or IDM_VTON_BASE_URL.';
  }

  return `${providerStatus.vton_provider} provider active`;
}
