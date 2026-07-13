function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function formatPixels(box) {
  if (!box) return 'N/A';
  return `x ${box.x}, y ${box.y}, w ${box.width}, h ${box.height}`;
}

export function ResultsPanel({ detections, disabled, isDetecting, onDetect }) {
  return (
    <aside className="panel results-panel">
      <div className="panel-heading">
        <h2>Detected bibs</h2>
        <button type="button" disabled={disabled} onClick={onDetect}>
          {isDetecting ? 'Detecting…' : 'Run detection'}
        </button>
      </div>

      {detections.length > 0 ? (
        <ul className="result-list">
          {detections.map((detection) => (
            <li key={detection.id}>
              <strong>#{detection.bibNumber ?? detection.displayNumber ?? '????'}</strong>
              <dl>
                <div>
                  <dt>OCR confidence</dt>
                  <dd>{Math.round((detection.ocrConfidence ?? detection.confidence ?? 0) * 100)}%</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detection.status ?? 'accepted'}</dd>
                </div>
                <div>
                  <dt>AI confidence</dt>
                  <dd>{detection.aiConfidence == null ? 'N/A' : `${Math.round(detection.aiConfidence * 100)}%`}</dd>
                </div>
                <div>
                  <dt>Overlay box</dt>
                  <dd>
                    x {formatPercent(detection.boundingBox.x)}, y {formatPercent(detection.boundingBox.y)}, w{' '}
                    {formatPercent(detection.boundingBox.width)}, h {formatPercent(detection.boundingBox.height)}
                  </dd>
                </div>
                <div>
                  <dt>Pixel box</dt>
                  <dd>{formatPixels(detection.pixelBoundingBox)}</dd>
                </div>
                {detection.digitScores?.length > 0 && (
                  <div>
                    <dt>Digit scores</dt>
                    <dd>
                      {detection.digitScores
                        .map((digit) => `${digit.value ?? '?'}:${Math.round(digit.score * 100)}%`)
                        .join(' ')}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">
          Results from <code>POST /api/detect</code> will include bib numbers, OCR confidence,
          optional AI confidence, and bounding boxes.
        </p>
      )}
    </aside>
  );
}
