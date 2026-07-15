import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';

function createDataURL(value) {
  const qr = qrcode(0, 'M');
  qr.addData(String(value || ''));
  qr.make();
  return qr.createDataURL(5, 2);
}

async function startScanner(video, onDecoded) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('الكاميرا غير مدعومة على هذا الجهاز. استخدم إدخال الكود يدويًا.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let frame = 0;
  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { detector = null; }
  }
  async function scan() {
    if (stopped) return;
    frame += 1;
    if (video.readyState >= 2 && frame % 4 === 0) {
      let decoded = '';
      if (detector) {
        const codes = await detector.detect(video).catch(() => []);
        decoded = codes[0]?.rawValue || '';
      }
      if (!decoded) {
        const width = Math.min(960, video.videoWidth || 640);
        const height = Math.round(width * ((video.videoHeight || 480) / (video.videoWidth || 640)));
        canvas.width = width; canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        decoded = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })?.data || '';
      }
      if (decoded) { stopped = true; stream.getTracks().forEach(track => track.stop()); onDecoded(decoded); return; }
    }
    requestAnimationFrame(scan);
  }
  scan();
  return { stop: async () => { stopped = true; stream.getTracks().forEach(track => track.stop()); video.srcObject = null; } };
}

window.TechnoQrTools = { createDataURL, startScanner };
