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
  const newTargetRes = await fetch(`${CDP_URL}/json/new?http://localhost:3030/`, { method: 'PUT' });
  const target = await newTargetRes.json();

  const session = cdpSession(target.webSocketDebuggerUrl);
  await session.waitOpen;

  await session.send('Page.enable');
  await session.send('DOM.enable');
  await session.send('Runtime.enable');

  // Desktop view
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  // 1. Auth screen
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.clear();
      location.reload();
    `
  });
  await sleep(2500);

  console.log('Capturing 01_auth_modal.png...');
  let screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '01_auth_modal.png'), Buffer.from(screenshot.data, 'base64'));

  // 2. Scanner view with logged in operator
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('userName', 'Sardor');
      localStorage.setItem('shift', '2-smena');
      localStorage.setItem('selectedFloor', '1');
      localStorage.setItem('activeMode', 'proverka');
      location.reload();
    `
  });
  await sleep(3000);

  console.log('Capturing 02_scanner_dashboard.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '02_scanner_dashboard.png'), Buffer.from(screenshot.data, 'base64'));

  // 3. Problem Department view
  await session.send('Runtime.evaluate', {
    expression: `
      const buttons = Array.from(document.querySelectorAll('button, a, div'));
      const problemBtn = buttons.find(b => b.textContent && b.textContent.includes('Проблемный отдел'));
      if (problemBtn) problemBtn.click();
    `
  });
  await sleep(2000);

  console.log('Capturing 03_problem_department.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '03_problem_department.png'), Buffer.from(screenshot.data, 'base64'));

  // 4. Mobile PDA view
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2.6,
    mobile: true
  });
  await session.send('Runtime.evaluate', {
    expression: `
      const buttons = Array.from(document.querySelectorAll('button, a, div'));
      const scanBtn = buttons.find(b => b.textContent && b.textContent.includes('Сканирование'));
      if (scanBtn) scanBtn.click();
    `
  });
  await sleep(2000);

  console.log('Capturing 04_mobile_view.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '04_mobile_view.png'), Buffer.from(screenshot.data, 'base64'));

  await fetch(`${CDP_URL}/json/close/${target.id}`);
  console.log('Done!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
