// pdf-generator.js - generate a simple A4 PDF with original + duplicate and watermark using pdf-lib
import { PDFDocument, rgb, StandardFonts } from 'https://cdn.jsdelivr.net/npm/pdf-lib@2.4.0/dist/pdf-lib.min.js';

function embedWatermarkImage(pdfDoc, page, imageBytes){
  // try embed as png or jpg
  let image;
  try{
    image = pdfDoc.embedPng(imageBytes);
  }catch(e){
    try{ image = pdfDoc.embedJpg(imageBytes); }catch(e2){ image = null; }
  }
  return image;
}

export async function generateRemitoPDF(remito, opts = { watermarkText: '', watermarkImage: null, duplicate: true }){
  const pdfDoc = await PDFDocument.create();
  const times = await pdfDoc.embedFont(StandardFonts.Helvetica);

  async function addPageWithContent(copyIndex){
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const fontSize = 10;
    page.drawText(`REMITO: ${remito.id}`, { x: 40, y: height - 60, size: 14, font: times });
    page.drawText(`Fecha: ${new Date(remito.fecha).toLocaleString()}`, { x: 40, y: height - 80, size: fontSize, font: times });
    page.drawText(`Cliente: ${remito.cliente}`, { x: 40, y: height - 100, size: fontSize, font: times });
    page.drawText(`Dirección: ${remito.direccion || '-'} `, { x: 40, y: height - 115, size: fontSize, font: times });

    // items
    let y = height - 150;
    page.drawText('Código', { x: 40, y, size: fontSize, font: times });
    page.drawText('Artículo', { x: 120, y, size: fontSize, font: times });
    page.drawText('Cant.', { x: 420, y, size: fontSize, font: times });
    page.drawText('Precio', { x: 470, y, size: fontSize, font: times });
    y -= 16;
    for (const it of remito.items){
      page.drawText(String(it.codigo), { x: 40, y, size: fontSize, font: times });
      page.drawText(String(it.articulo).slice(0,40), { x: 120, y, size: fontSize, font: times });
      page.drawText(String(it.cantidad), { x: 420, y, size: fontSize, font: times });
      page.drawText((it.precio==null? '-' : ('$'+Number(it.precio).toFixed(2))), { x: 470, y, size: fontSize, font: times });
      y -= 14; if (y < 120) break; // leave room for footer
    }

    // watermark image or text
    if (opts.watermarkImage){
      try{
        const img = await embedWatermarkImage(pdfDoc, page, opts.watermarkImage);
        if (img){
          const imgDims = img.scale(0.5);
          page.drawImage(img, { x: (width - imgDims.width)/2, y: (height - imgDims.height)/2, width: imgDims.width, height: imgDims.height, opacity: 0.12 });
        }
      }catch(e){ console.warn('No se pudo insertar watermark image', e); }
    } else if (opts.watermarkText){
      page.drawText(opts.watermarkText, { x: width*0.15, y: height/2, size: 60, font: times, color: rgb(0.9,0.9,0.9), opacity: 0.18 });
    }

    // footer
    page.drawText(copyIndex === 0 ? 'ORIGINAL' : 'DUPLICADO', { x: 40, y: 30, size: 10, font: times });
  }

  await addPageWithContent(0);
  if (opts.duplicate) await addPageWithContent(1);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
