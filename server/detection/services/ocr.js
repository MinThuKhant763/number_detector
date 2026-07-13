export async function runOcr(_image, region) {
  return {
    ...region,
    bibNumber: '1234',
    ocrConfidence: 0.86,
  };
}
