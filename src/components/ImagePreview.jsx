export function ImagePreview({ imageUrl, detections }) {
  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <h2>Image preview</h2>
        <span>{detections.length} overlay{detections.length === 1 ? '' : 's'}</span>
      </div>

      <div className="image-stage">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="Uploaded race" />
            {detections.map((detection) => (
              <div
                className="bounding-box"
                key={detection.id}
                style={{
                  left: `${detection.boundingBox.x}%`,
                  top: `${detection.boundingBox.y}%`,
                  width: `${detection.boundingBox.width}%`,
                  height: `${detection.boundingBox.height}%`,
                }}
              >
                <span>{detection.bibNumber}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="empty-state">Choose a race photo to see a preview here.</div>
        )}
      </div>
    </section>
  );
}
