// pdf-generator.js - generate a simple A4 PDF with original + duplicate and watermark using pdf-lib
import { PDFDocument, rgb, StandardFonts } from 'https://cdn.jsdelivr.net/npm/pdf-lib@2.4.0/dist/pdf-lib.min.js';

export async function generateRemitoPDF(remito, opts = { watermark: '', duplicate: true }){
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.Helvetica);

  function addPageWithContent(copyIndex){
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 in points
    const { width, height } = page.getSize();
    const fontSize = 10;
    page.drawText(`REMITO: ${remito.id}`, { x: 40, y: height - 60, size: 14, font: timesRoman });
    page.drawText(`Fecha: ${new Date(remito.fecha).toLocaleString()}`, { x: 40, y: height - 80, size: fontSize, font: timesRoman });
    page.drawText(`Cliente: ${remito.cliente}`, { x: 40, y: height - 100, size: fontSize, font: timesRoman });
    page.drawText(`Dirección: ${remito.direccion || '-'} `, { x: 40, y: height - 115, size: fontSize, font: timesRoman });

    // items
    let y = height - 150;
    page.drawText('Código', { x: 40, y, size: fontSize, font: timesRoman });
    page.drawText('Artículo', { x: 120, y, size: fontSize, font: timesRoman });
    page.drawText('Cant.', { x: 420, y, size: fontSize, font: timesRoman });
    page.drawText('Precio', { x: 470, y, size: fontSize, font: timesRoman });
    y -= 16;
    for (const it of remito.items){
      page.drawText(String(it.codigo), { x: 40, y, size: fontSize, font: timesRoman });
      page.drawText(String(it.articulo).slice(0,40), { x: 120, y, size: fontSize, font: timesRoman });
      page.drawText(String(it.cantidad), { x: 420, y, size: fontSize, font: timesRoman });
      page.drawText((it.precio==null? '-' : ('$'+Number(it.precio).toFixed(2))), { x: 470, y, size: fontSize, font: timesRoman });
      y -= 14; if (y < 80) break;
    }

    // watermark
    if (opts.watermark){
      page.drawText(opts.watermark, { x: 80, y: height/2, size: 60, font: timesRoman, color: rgb(0.9,0.9,0.9), rotate: undefined, opacity: 0.18 });
    }

    // footer: original/duplicado label
    page.drawText(copyIndex === 0 ? 'ORIGINAL' : 'DUPLICADO', { x: 40, y: 30, size: 10, font: timesRoman });
  }

  addPageWithContent(0);
  if (opts.duplicate) addPageWithContent(1);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
