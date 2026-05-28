const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

async function extractTextFromFile(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();

  // PDF
  if (mimetype === 'application/pdf' || ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const text = data.text.trim();

      // Wenn PDF kaum Text hat → OCR auf den Seiten
      if (text.length < 100) {
        return await ocrFile(filePath);
      }
      return text;
    } catch (err) {
      console.error('PDF-Parse Fehler, versuche OCR:', err.message);
      return await ocrFile(filePath);
    }
  }

  // Bilder → OCR
  if (['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/webp'].includes(mimetype)) {
    return await ocrFile(filePath);
  }

  throw new Error('Nicht unterstütztes Dateiformat: ' + mimetype);
}

async function ocrFile(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, 'deu', {
      logger: () => {} // Logs unterdrücken
    });
    return result.data.text.trim();
  } catch (err) {
    throw new Error('OCR fehlgeschlagen: ' + err.message);
  }
}

module.exports = { extractTextFromFile };
