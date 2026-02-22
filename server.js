require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");
const QRCode = require("qrcode");
const cloudinary = require("cloudinary").v2;

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const exportsDir = path.join(publicDir, "exports");
const CLOUDINARY_PUBLIC_ID = process.env.CLOUDINARY_PUBLIC_ID || "photobooth-latest";

fs.mkdirSync(exportsDir, { recursive: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.json({ limit: "25mb" }));
app.use(express.static(publicDir));

app.get("/download/:file", (req, res) => {
  const safeName = path.basename(req.params.file);
  const filePath = path.join(exportsDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  return res.download(filePath, safeName);
});

app.get("/view/:file", (req, res) => {
  const safeName = path.basename(req.params.file);
  const filePath = path.join(exportsDir, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const imageUrl = `${baseUrl}/exports/${safeName}`;

  return res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Photobooth Download</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #fef6e4; margin: 0; padding: 24px; text-align: center; }
      .card { background: #fff; padding: 24px; border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.12); }
      img { max-width: 100%; border-radius: 12px; border: 3px solid #403b37; }
      a { display: inline-block; margin-top: 16px; padding: 12px 20px; background: #7bdff2; color: #403b37; text-decoration: none; border-radius: 999px; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Your photobooth strip</h2>
      <img src="${imageUrl}" alt="Photobooth strip" />
      <div>
        <a href="${imageUrl}" download>Download PNG</a>
      </div>
      <p>Tip: On iPhone/Android, tap the image to open, then save to Photos.</p>
    </div>
  </body>
</html>`);
});

app.post("/api/upload", async (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith("data:image/png")) {
      return res.status(400).json({ error: "Invalid dataUrl" });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: "Cloudinary not configured" });
    }

    const uploadResult = await cloudinary.uploader.upload(dataUrl, {
      public_id: CLOUDINARY_PUBLIC_ID,
      overwrite: true,
      invalidate: true,
      resource_type: "image",
      format: "png"
    });

    const downloadUrl = uploadResult.secure_url;
    const qrDataUrl = await QRCode.toDataURL(downloadUrl, { margin: 1, width: 256 });

    return res.json({ downloadUrl, qrDataUrl });
  } catch (error) {
    return res.status(500).json({ error: "Upload failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Photobooth running at http://localhost:${PORT}`);
});
