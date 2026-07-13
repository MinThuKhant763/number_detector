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
                  <dt>AI confidence</dt>
                  <dd>{detection.aiConfidence == null ? 'N/A' : `${Math.round(detection.aiConfidence * 100)}%`}</dd>
                </div>
                <div>
                  <dt>Bounding box</dt>
                  <dd>
                    x {detection.boundingBox.x}%, y {detection.boundingBox.y}%, w{' '}
                    {detection.boundingBox.width}%, h {detection.boundingBox.height}%
                  </dd>
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
