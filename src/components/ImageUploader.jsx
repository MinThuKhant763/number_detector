export function ImageUploader({ onImageSelected, selectedName }) {
  function handleChange(event) {
    const [file] = event.target.files;
    if (file) {
      onImageSelected(file);
    }
  }

  return (
    <label className="upload-card">
      <span className="upload-title">Upload race image</span>
      <span className="upload-file-name">{selectedName}</span>
      <input type="file" accept="image/*" onChange={handleChange} />
    </label>
  );
}
