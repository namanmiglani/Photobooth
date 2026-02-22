require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
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

app.use(express.json({ limit: "50mb" }));
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

app.get("/view-video/:id", async (req, res) => {
    const videoId = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const mp4Url = `https://res.cloudinary.com/${cloudName}/video/upload/${videoId}.mp4`;

    return res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Photobooth Video</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #fef6e4; margin: 0; padding: 24px; text-align: center; }
      .card { background: #fff; padding: 24px; border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.12); max-width: 480px; margin: 0 auto; }
      video { width: 100%; border-radius: 12px; border: 3px solid #403b37; background: #000; }
      a { display: inline-block; margin-top: 16px; padding: 12px 20px; background: #7bdff2; color: #403b37; text-decoration: none; border-radius: 999px; font-weight: 600; }
      .tip { font-size: 0.85rem; color: #888; margin-top: 12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Your photobooth video</h2>
      <video src="${mp4Url}" controls playsinline autoplay muted loop></video>
      <div>
        <a href="${mp4Url}" download>Download Video</a>
      </div>
      <p class="tip">iPhone: Tap and hold the video, then tap "Save to Files" or use the download button.</p>
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

app.post("/api/upload-video", async (req, res) => {
    try {
        const { dataUrl } = req.body;
        if (!dataUrl || !dataUrl.startsWith("data:video/")) {
            return res.status(400).json({ error: "Invalid video dataUrl" });
        }

        if (!process.env.CLOUDINARY_CLOUD_NAME) {
            return res.status(500).json({ error: "Cloudinary not configured" });
        }

        const videoPublicId = `photobooth-video-${Date.now()}`;
        const uploadResult = await cloudinary.uploader.upload(dataUrl, {
            public_id: videoPublicId,
            resource_type: "video",
            overwrite: true,
            invalidate: true
        });

        // Build an MP4 URL for iPhone compatibility
        const baseUrl = uploadResult.secure_url.replace(/\.[^.]+$/, ".mp4");
        const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
        const viewUrl = `${publicBaseUrl}/view-video/${videoPublicId}`;
        const qrDataUrl = await QRCode.toDataURL(baseUrl, { margin: 1, width: 256 });

        return res.json({ videoUrl: baseUrl, viewUrl, qrDataUrl });
    } catch (error) {
        console.error("Video upload failed:", error);
        return res.status(500).json({ error: "Video upload failed" });
    }
});

app.post("/api/print", async (req, res) => {
    try {
        const { dataUrl } = req.body;
        if (!dataUrl || !dataUrl.startsWith("data:image/png")) {
            return res.status(400).json({ error: "Invalid dataUrl" });
        }

        // Save to a temp file
        const fileName = `print-${Date.now()}.png`;
        const filePath = path.join(exportsDir, fileName);
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(filePath, base64Data, "base64");

        const platform = os.platform();
        const defaultPrinterName =
            platform === "darwin" ? "Canon_SELPHY_CP150" : "Canon SELPHY CP150";
        const printerName = process.env.PRINTER_NAME || defaultPrinterName;

        let printCmd;
        if (platform === "darwin") {
            // macOS — CUPS lp command
            printCmd = `lp -d "${printerName}" "${filePath}"`;
        } else if (platform === "win32") {
            // Windows — mspaint silent print
            printCmd = `mspaint /pt "${filePath}" "${printerName}"`;
        } else {
            // Linux fallback — CUPS
            printCmd = `lp -d "${printerName}" "${filePath}"`;
        }

        await new Promise((resolve, reject) => {
            exec(printCmd, (error, stdout, stderr) => {
                // Clean up temp file regardless of result
                try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }

                if (error) {
                    console.error("Print error:", error.message);
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        return res.json({ success: true });
    } catch (error) {
        console.error("Print failed:", error.message);
        return res.status(500).json({ error: "Print failed: " + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Photobooth running at http://localhost:${PORT}`);
});
