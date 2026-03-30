import type { OpenNICameraPreview, OpenNICameraStatus } from '../types/fitting';

type OpenNICameraPanelProps = {
  status: OpenNICameraStatus | null;
  preview: OpenNICameraPreview | null;
  onReconnect: () => void;
  isBusy?: boolean;
};

export function OpenNICameraPanel({ status, preview, onReconnect, isBusy = false }: OpenNICameraPanelProps) {
  const connected = Boolean(status?.connected);
  const capturedAt = preview?.captured_at ? new Date(preview.captured_at).toLocaleTimeString() : '-';

  return (
    <section className="panel sensor-panel">
      <div className="result-header">
        <div>
          <span className="photo-label">Backend sensor preview</span>
          <strong>{connected ? 'OpenNI / Astra streams connected' : 'OpenNI / Astra not connected'}</strong>
        </div>
        <button type="button" className="secondary-action-button" onClick={onReconnect} disabled={isBusy}>
          Reconnect OpenNI camera
        </button>
      </div>

      <div className="sensor-meta">
        <span>Package: {status?.package_available ? 'openni available' : 'openni missing'}</span>
        <span>SDK: {status?.sdk_loaded ? `loaded from ${status.dll_directory}` : 'not loaded'}</span>
        <span>Device: {status?.name ?? status?.device_uri ?? 'not detected'}</span>
        <span>
          Sensors:{' '}
          {status
            ? [status.sensors.color ? 'RGB' : null, status.sensors.depth ? 'Depth' : null, status.sensors.ir ? 'IR' : null]
                .filter(Boolean)
                .join(' / ') || 'none'
            : 'unknown'}
        </span>
        <span>Updated: {capturedAt}</span>
      </div>

      <p className="sensor-copy">{status?.message ?? 'Checking OpenNI camera status.'}</p>
      {status?.last_error ? <p className="sensor-error">Last error: {status.last_error}</p> : null}

      <div className="sensor-grid">
        <SensorCard title="RGB" imageUrl={preview?.color_image_data_url} dimensions={formatDimensions(preview?.color_width, preview?.color_height)} />
        <SensorCard title="Depth" imageUrl={preview?.depth_image_data_url} dimensions={formatDimensions(preview?.depth_width, preview?.depth_height)} />
        <SensorCard title="IR" imageUrl={preview?.ir_image_data_url} dimensions={formatDimensions(preview?.ir_width, preview?.ir_height)} />
      </div>
    </section>
  );
}

type SensorCardProps = {
  title: string;
  imageUrl: string | null | undefined;
  dimensions: string;
};

function SensorCard({ title, imageUrl, dimensions }: SensorCardProps) {
  return (
    <div className="sensor-card">
      <div className="sensor-card-header">
        <strong>{title}</strong>
        <span>{dimensions}</span>
      </div>
      <div className="sensor-stage">
        {imageUrl ? (
          <img className="sensor-image" src={imageUrl} alt={`${title} preview`} />
        ) : (
          <div className="empty-state">
            <div>
              <strong>{title} preview unavailable</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDimensions(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height) {
    return '-';
  }
  return `${width} x ${height}`;
}
