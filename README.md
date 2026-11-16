# NIC Core

## Project structure
- `server.js` and `package.json` are in the repository root.
- Front-end files are inside `public/`.

## Run
```bash
npm install
npm start
```

## Render deployment
Create a Render **Web Service** connected to this repository.
- Build command: `npm install`
- Start command: `npm start`

The repository root must contain `server.js`, `package.json`, and the `public` folder.
The `public` folder must contain `index.html`, `style.css`, and `app.js`.

After upload, verify the GitHub repository displays:
```text
NIC-Core/
├── package.json
├── server.js
├── NIC_Core_ESP32.ino
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

Render free instances use an ephemeral filesystem. SQLite history may not persist across restarts/redeploys unless you configure persistent storage or use a managed database.

Web Bluetooth requires HTTPS (Render URL) and a supported browser such as Chrome or Edge. The ESP32 must be physically near the device running the browser.
