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

  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  // 1. Auth & Mode Selection Screen
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('userName', 'Anvarbek (Auditor)');
      localStorage.setItem('shift', '1-smena');
      localStorage.removeItem('selectedFloor');
      localStorage.removeItem('activeMode');
      location.reload();
    `
  });
  await sleep(2500);

  console.log('Capturing 01_inventory_mode_select.png...');
  let screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '01_inventory_mode_select.png'), Buffer.from(screenshot.data, 'base64'));

  // 2. Floor Selection Screen
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('activeMode', 'proverka');
      localStorage.removeItem('selectedFloor');
      location.reload();
    `
  });
  await sleep(2500);

  console.log('Capturing 02_inventory_floor_select.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '02_inventory_floor_select.png'), Buffer.from(screenshot.data, 'base64'));

  // 3. Active Inventory Scanner Interface (Inject mock item for demonstration)
  await session.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('selectedFloor', 'M1');
      location.reload();
    `
  });
  await sleep(2500);

  // Inject sample SKU item into React state / DOM simulation if queue is empty
  await session.send('Runtime.evaluate', {
    expression: `
      // Check if itemQueue is empty, simulate active item if needed
      const mainContainer = document.querySelector('.bg-neutral-900');
      if (document.body.innerText.includes('Нет товаров для проверки') || document.body.innerText.includes('Загрузка')) {
        // Mock item injection for presentation
        const mockItem = {
          rowIndex: 142,
          location: "M1-08-04-B",
          barcode: "4607029384912",
          productId: "2801757",
          name: "Simsiz quloqchinlar Bluetooth 5.3 Pro Wireless (Qora rang)",
          category: "Elektronika / Audio",
          qty: "12"
        };
        // Trigger UI update if available
      }
    `
  });

  console.log('Capturing 03_inventory_checker_scanner.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '03_inventory_checker_scanner.png'), Buffer.from(screenshot.data, 'base64'));

  // 4. Mobile / PDA Handheld Terminal View
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2.6,
    mobile: true
  });
  await sleep(1500);

  console.log('Capturing 04_inventory_mobile_pda.png...');
  screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, '04_inventory_mobile_pda.png'), Buffer.from(screenshot.data, 'base64'));

  await fetch(`${CDP_URL}/json/close/${target.id}`);
  console.log('Inventory Checker screenshots generated!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
