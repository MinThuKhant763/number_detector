import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageUploader } from './components/ImageUploader.jsx';
import { ImagePreview } from './components/ImagePreview.jsx';
import { ResultsPanel } from './components/ResultsPanel.jsx';
import { detectBibNumbers } from './lib/api.js';
import './styles.css';

function App() {
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const previousUrl = useRef('');

  const hasImage = Boolean(imageFile && imageUrl);
  const imageName = useMemo(() => imageFile?.name ?? 'No image selected', [imageFile]);

  function handleImageSelected(file) {
    setError('');
    setResults([]);
    setImageFile(file);

    if (previousUrl.current) {
      URL.revokeObjectURL(previousUrl.current);
    }

    const nextUrl = URL.createObjectURL(file);
    previousUrl.current = nextUrl;
    setImageUrl(nextUrl);
  }

  async function handleDetect() {
    if (!imageFile) {
      setError('Upload a race image before running detection.');
      return;
    }

    setIsDetecting(true);
    setError('');

    try {
      const payload = await detectBibNumbers(imageFile);
      setResults(payload.detections ?? []);
    } catch (err) {
      setError(err.message || 'Detection failed. Please try again.');
    } finally {
      setIsDetecting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Race day computer vision</p>
          <h1>Bib Number Detector</h1>
          <p className="hero-copy">
            Upload a race photo, preview it, and send it to a modular detection API that can be
            backed by OCR, object detection, or an AI post-processing step.
          </p>
        </div>
        <ImageUploader onImageSelected={handleImageSelected} selectedName={imageName} />
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace-grid">
        <ImagePreview imageUrl={imageUrl} detections={results} />
        <ResultsPanel
          detections={results}
          disabled={!hasImage || isDetecting}
          isDetecting={isDetecting}
          onDetect={handleDetect}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
