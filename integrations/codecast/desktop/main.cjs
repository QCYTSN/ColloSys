const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const brand = require('../brand.json');
const productVersion = require('../../../package.json').version;
const data = path.join(root, '.local/codecast-app');
const origin = 'http://127.0.0.1:3407';
const { app, BrowserWindow, Menu, ipcMain, dialog, session } = electron;
const hasWindowMenu = process.platform === 'darwin';
const profile = process.env.COLLOSYS_DESKTOP_PROFILE || 'default';
if (!/^(default|test-[a-f0-9-]{36})$/.test(profile)) throw new Error('Invalid desktop profile');
const entryUrl =
  process.env.COLLOSYS_WORKBENCH_PREVIEW === '1'
    ? `${origin}/workbench-preview`
    : process.env.COLLOSYS_DESIGN_LAB === '1'
      ? `${origin}/design-lab`
      : origin;
process.env.COLLOSYS_URL = entryUrl;
process.env.COLLOSYS_USER_DATA = path.join(data, 'desktop-profiles', profile);
delete process.env.COLLOSYS_CLAIM_PROTOCOL;
// Stop secondary processes before Chromium opens the shared profile/cache.
// The reused framework registers the first instance's focus handler and keeps
// the same lock when it initializes below.
app.setPath('userData', process.env.COLLOSYS_USER_DATA);
if (!app.requestSingleInstanceLock()) app.exit(0);
// This non-secret native preference is a projection of the renderer's one
// appearance setting. It never moves or duplicates the user profile/database.
const appearancePath = path.join(process.env.COLLOSYS_USER_DATA, 'collosys-appearance-v1.json');
let initialMode = 'system';
try {
  const saved = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));
  if (saved.version === 1 && ['light', 'dark', 'system'].includes(saved.mode)) initialMode = saved.mode;
} catch { /* First start or damaged preference follows the OS. */ }
electron.nativeTheme.themeSource = initialMode;
const nativeBackground = () => electron.nativeTheme.shouldUseDarkColors ? '#202127' : '#ffffff';
const pair = fs.readFileSync(path.join(data, 'browser-pairing'), 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(pair)) throw new Error('Invalid local pairing state');
const framework = path.join(data, 'desktop-framework');
const { createDesktopApp } = require(path.join(framework, 'src/main.js'));

function trusted(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent || new URL(frame.url).origin !== origin)
    throw new Error('Untrusted desktop request');
}
ipcMain.handle('collosys:auth:start:v1', async (event, request) => {
  trusted(event);
  if (!request || request.version !== 1 || !/^[a-f0-9-]{36}$/.test(request.attemptId) || !['github', 'google'].includes(request.provider)) throw new Error('Invalid sign-in request');
  // No renderer-supplied URL, protocol or host crosses this boundary.
  await electron.shell.openExternal(`${origin}/auth/desktop?attempt=${encodeURIComponent(request.attemptId)}`);
});
ipcMain.handle('collosys:appearance:v1', (event, request) => {
  trusted(event);
  if (!request || request.version !== 1 || !['dark', 'light', 'system'].includes(request.mode) || !['dark', 'light'].includes(request.theme) || !['#202127', '#ffffff'].includes(request.background)) throw new Error('Invalid appearance');
  electron.nativeTheme.themeSource = request.mode;
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(request.background);
  fs.mkdirSync(path.dirname(appearancePath), { recursive: true });
  const temporary = appearancePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, mode: request.mode }));
  fs.renameSync(temporary, appearancePath);
});
const guardedIpc = new Proxy(ipcMain, {
  get(target, property) {
    if (property === 'handle')
      return (channel, handler) =>
        target.handle(channel, (event, ...args) => {
          trusted(event);
          // The local application cannot extend its origin/capability boundary or
          // register OS handlers. The underlying framework's rest of IPC is reused.
          if (channel === 'host-policy')
            return {
              permissions: ['clipboard-sanitized-write', 'fullscreen'],
              hosts: [],
              version: app.getVersion(),
            };
          if (channel === 'set-default-client') return false;
          if (['desktop-sources', 'select-display-source'].includes(channel))
            throw new Error('Screen capture is unavailable in this local product.');
          return handler(event, ...args);
        });
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
function ProductWindow(options) {
  const window = new BrowserWindow({
    ...options,
    title: brand.name,
    titleBarStyle: 'default',
    frame: true,
    autoHideMenuBar: !hasWindowMenu,
    webPreferences: {
      ...options.webPreferences,
      preload: path.join(framework, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!hasWindowMenu) { window.setMenu(null); window.setMenuBarVisibility(false); }
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
    const key = input.key.toLowerCase(), contents = window.webContents;
    const edits = { c: 'copy', x: 'cut', v: 'paste', a: 'selectAll', z: input.shift ? 'redo' : 'undo', y: 'redo' };
    if (edits[key] && !input.alt) { event.preventDefault(); contents[edits[key]](); }
    else if (['+', '=', '-', '0'].includes(key)) { event.preventDefault(); contents.setZoomFactor(key === '0' ? 1 : Math.max(0.5, Math.min(2, contents.getZoomFactor() + (key === '-' ? -0.1 : 0.1)))); }
    else if (key === ',') { event.preventDefault(); desktop.navigateMain('/settings'); }
    else if (key === 'q') { event.preventDefault(); app.quit(); }
  });
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(brand.name);
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      title: 'Close ColloSys?',
      message: 'Some workspace changes are still syncing.',
      detail:
        'Keep ColloSys open to let them finish, or close now. Saved file checkpoints remain on this device.',
      buttons: ['Keep open', 'Close now'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  const loadURL = window.loadURL.bind(window);
  window.loadURL = (value, options) => {
    const url = new URL(value);
    if (url.origin !== origin)
      throw new Error('Only the local product can open in this desktop window');
    if (!url.hash) url.hash = new URLSearchParams({ pair }).toString();
    return loadURL(url.href, options);
  };
  return window;
}
// Keep native BrowserWindow instances: Electron's static enumeration filters
// out custom subclasses, which otherwise breaks close and notification routing.
Object.setPrototypeOf(ProductWindow, BrowserWindow);
let desktop;
function nativeMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        ...[
          ['Projects', '/projects'],
          ['Inbox', '/inbox'],
          ['Tasks', '/tasks'],
          ['Settings', '/settings'],
        ].map(([label, route]) => ({ label, click: () => desktop.navigateMain(route) })),
        { type: 'separator' },
        { role: 'quit', label: 'Quit ColloSys' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About ColloSys',
          click: () =>
            dialog.showMessageBox(desktop.getMainWindow(), {
              title: 'ColloSys',
              message: `${brand.name} ${productVersion}`,
              detail: `${brand.description}\n\n${brand.attribution}\nCheckpoint file contents are stored on the source device.`,
            }),
        },
      ],
    },
  ]);
}
const productMenu = new Proxy(Menu, {
  get(target, property) {
    if (property === 'setApplicationMenu') return () => Menu.setApplicationMenu(hasWindowMenu ? nativeMenu() : null);
    return Reflect.get(target, property);
  },
});
// Registered before the framework's ready callback. This closes the network
// boundary for every renderer, including detached windows and hidden views.
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed =
        ['data:', 'blob:', 'devtools:'].includes(url.protocol) ||
        (['http:', 'ws:'].includes(url.protocol) && url.hostname === '127.0.0.1');
    } catch {}
    callback({ cancel: !allowed });
  });
});
desktop = createDesktopApp(
  {
    productName: 'ColloSys',
    appId: 'local.collosys.desktop',
    protocol: 'collosys',
    envPrefix: 'COLLOSYS',
    urls: { prod: entryUrl },
    bridgeGlobal: '__COLLOSYS_DESKTOP__',
    events: {
      navigate: 'collosys:navigate:v1',
      newSession: '__COLLOSYS_NEW_SESSION_V1',
      htmlClass: 'electron-desktop',
    },
    assets: { icon: path.join(root, 'dist/codecast-app', brand.desktopIcon) },
    window: { width: 1440, height: 960, minWidth: 900, minHeight: 640, backgroundColor: nativeBackground() },
    update: { enabled: false },
    web: { cache: false },
    palette: null,
    menu: {
      newSessionLabel: null,
      settingsPath: '/settings',
      navItems: [
        { label: 'Projects', path: '/projects' },
        { label: 'Inbox', path: '/inbox' },
        { label: 'Tasks', path: '/tasks' },
      ],
    },
    ipc: {
      handlers: {
        chooseDirectory: async () => {
          const selected = await dialog.showOpenDialog(desktop.getMainWindow(), {
            title: 'Choose a project directory',
            properties: ['openDirectory'],
          });
          return { path: selected.canceled ? null : selected.filePaths[0] || null };
        },
      },
    },
    hooks: {
      onReady() {
        session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
        const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
        session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
          callback(allowed.has(permission) && new URL(contents.getURL()).origin === origin),
        );
        session.defaultSession.setPermissionCheckHandler(
          (contents, permission) =>
            !!contents && allowed.has(permission) && new URL(contents.getURL()).origin === origin,
        );
        Menu.setApplicationMenu(hasWindowMenu ? nativeMenu() : null);
        console.log('ColloSys desktop window ready.');
      },
    },
  },
  {
    ...electron,
    BrowserWindow: ProductWindow,
    ipcMain: guardedIpc,
    Menu: productMenu,
    shell: { ...electron.shell, openExternal: async () => {} },
  },
);
app.on('window-all-closed', () => app.quit());
