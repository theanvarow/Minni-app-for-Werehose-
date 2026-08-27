import fs from 'fs';
import path from 'path';

const CDP_URL = 'http://127.0.0.1:9222';
const SCREENSHOT_DIR = path.resolve('docs/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = ++id;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  const waitOpen = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (err) => reject(err);
  });

  return { ws, send, waitOpen };
}

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function capture() {
  console.log('Connecting to Chrome CDP...');
  const newTargetRes = await fetch(`${CDP_URL}/json/new?https://inventory-checker-nu.vercel.app/`, { method: 'PUT' });
  const target = await newTargetRes.json();

  const session = cdpSession(target.webSocketDebuggerUrl);
  await session.waitOpen;

  await session.send('Page.enable');
  await session.send('DOM.enable');
  await session.send('Runtime.enable');

  // Desktop View
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  // 1. Auth Modal
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.clear();
      location.reload();
    `
  });
  await sleep(3500);

  console.log('1. Capturing 01_auth_modal.png...');
  let screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '01_auth_modal.png'), Buffer.from(screenshot.data, 'base64'));

  // 2. Mode Selection Screen
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('userName', 'Анварбек');
      localStorage.setItem('shift', '1');
      localStorage.removeItem('selectedFloor');
      localStorage.removeItem('activeMode');
      location.reload();
    `
  });
  await sleep(3000);

  console.log('2. Capturing 02_mode_selection.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '02_mode_selection.png'), Buffer.from(screenshot.data, 'base64'));

  // 3. Floor Selection Screen
  await session.send('Runtime.evaluate', {
    expression: `
      const buttons = Array.from(document.querySelectorAll('button'));
      const modeBtn = buttons.find(b => b.textContent && b.textContent.includes('Проверка размещения'));
      if (modeBtn) modeBtn.click();
    `
  });
  await sleep(1500);

  console.log('3. Capturing 03_floor_selection.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '03_floor_selection.png'), Buffer.from(screenshot.data, 'base64'));

  // 4. Shift Statistics Modal
  console.log('4. Capturing 05_statistics_modal.png...');
  await session.send('Runtime.evaluate', {
    expression: `
      const buttons = Array.from(document.querySelectorAll('button'));
      const statBtn = buttons.find(b => b.textContent && (b.textContent.includes('Статистика') || b.textContent.includes('📊')));
      if (statBtn) statBtn.click();
    `
  });
  await sleep(2500);

  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '05_statistics_modal.png'), Buffer.from(screenshot.data, 'base64'));

  // 5. Mobile & PDA Scanner View
  console.log('5. Capturing 06_mobile_pda.png...');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2.6,
    mobile: true
  });
  await session.send('Runtime.evaluate', {
    expression: `
      const closeButtons = Array.from(document.querySelectorAll('button'));
      const closeBtn = closeButtons.find(b => b.textContent && (b.textContent.includes('✕') || b.textContent.includes('Закрыть')));
      if (closeBtn) closeBtn.click();
    `
  });
  await sleep(2000);

  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '06_mobile_pda.png'), Buffer.from(screenshot.data, 'base64'));

  await fetch(`${CDP_URL}/json/close/${target.id}`);
  console.log('All screenshots generated!');
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
