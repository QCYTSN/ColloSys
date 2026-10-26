const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const data = path.join(root, '.local/codecast-app');
const origin = 'http://127.0.0.1:3407';
const { app, BrowserWindow, Menu, ipcMain, dialog, session } = electron;
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
const pair = fs.readFileSync(path.join(data, 'browser-pairing'), 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(pair)) throw new Error('Invalid local pairing state');
const framework = path.join(data, 'desktop-framework');
const { createDesktopApp } = require(path.join(framework, 'src/main.js'));

function trusted(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent || new URL(frame.url).origin !== origin)
    throw new Error('Untrusted desktop request');
}
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
    title: 'ColloSys',
    titleBarStyle: 'default',
    frame: true,
    webPreferences: {
      ...options.webPreferences,
      preload: path.join(framework, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle('ColloSys');
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
              message: 'ColloSys',
              detail:
                'Local team collaboration. Built on Codecast (MIT). Checkpoint file contents are stored on the source device.',
            }),
        },
      ],
    },
  ]);
}
const productMenu = new Proxy(Menu, {
  get(target, property) {
    if (property === 'setApplicationMenu') return () => Menu.setApplicationMenu(nativeMenu());
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
    bridgeGlobal: '__CODECAST_ELECTRON__',
    events: {
      navigate: 'codecast-navigate',
      newSession: '__CODECAST_NEW_SESSION',
      htmlClass: 'electron-desktop',
    },
    assets: { icon: path.join(root, 'dist/codecast-app/android-chrome-512x512.png') },
    window: { width: 1440, height: 960, minWidth: 900, minHeight: 640, backgroundColor: '#f5f5f2' },
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
        Menu.setApplicationMenu(nativeMenu());
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
