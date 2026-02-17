# Photobooth

Simple photobooth app that captures 6 photos, lets users select 4, and exports a double 2×6 inch strip at 300 DPI with a QR download link.

## Run

1. Install dependencies:
   - `npm install`
2. Start the server:
   - `npm start`
3. Open in browser:
   - `http://localhost:3000`

### QR link on phones

If the kiosk uses localhost, phones cannot reach it. Use your machine IP instead:

- Start server with a public base URL:
  - `PUBLIC_BASE_URL=http://<your-ip>:3000 npm start`
- Then open `http://<your-ip>:3000` on the kiosk browser.
