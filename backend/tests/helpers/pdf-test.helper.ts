/**
 * Helper utilitário para construção de buffers PDF binários reais em memória nos testes.
 *
 * Desacopla a geração de payloads PDF das suítes de teste executáveis,
 * impedindo a execução colateral de testes (ACH-TEST-01 corrigido na Sprint 10.5).
 */

export interface BuildRealPdfBufferOptions {
  pageTexts: string[];
}

/**
 * Constrói um buffer PDF 1.4 binário real e válido (com cabeçalho %PDF-1.4, objetos, xref e %%EOF)
 * para exercitar validadores de magic bytes, extratores PdfJsTextExtractor e pipelines multipart.
 */
export function buildRealPdfBuffer(options: BuildRealPdfBufferOptions): Buffer {
  const objects: string[] = [];
  const pageCount = options.pageTexts.length;

  // Obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  const kidsRefs = options.pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`
  );

  // Obj 3: Font
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );

  // Para cada página, cria Page obj (4 + i*2) e Content stream obj (5 + i*2)
  options.pageTexts.forEach((text, i) => {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;
    const escapedText = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const streamContent =
      escapedText.length > 0
        ? `BT /F1 12 Tf 50 700 Td (${escapedText}) Tj ET`
        : '';

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  });

  let pdfContent = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdfContent, 'latin1'));
    pdfContent += obj;
  }

  const xrefStart = Buffer.byteLength(pdfContent, 'latin1');
  const totalEntries = objects.length + 1;
  pdfContent += `xref\n0 ${totalEntries}\n0000000000 65535 f \n`;

  for (let idx = 1; idx < offsets.length; idx++) {
    const padded = String(offsets[idx]).padStart(10, '0');
    pdfContent += `${padded} 00000 n \n`;
  }

  pdfContent += `trailer\n<< /Size ${totalEntries} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdfContent, 'latin1');
}
