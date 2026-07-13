export async function runBibDetector(image) {
  return [
    {
      id: `${image.originalName}-candidate-1`,
      boundingBox: {
        x: 37,
        y: 42,
        width: 26,
        height: 14,
      },
    },
  ];
}
