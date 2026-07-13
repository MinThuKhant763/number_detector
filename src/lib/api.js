const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function detectBibNumbers(imageFile) {
  const body = new FormData();
  body.append('image', imageFile);

  const response = await fetch(`${API_BASE_URL}/api/detect`, {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Detection API returned ${response.status}`);
  }

  return response.json();
}
