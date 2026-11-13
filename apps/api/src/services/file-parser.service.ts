import zlib from 'node:zlib';

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface ParsedFileResult {
  fileFormat: 'XLSX' | 'CSV' | 'PDF';
  sizeBytes: number;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  pdfMetadata?: {
    hasSelectableText: boolean;
    requiresOcrOrManualReview: boolean;
    extractedRawText: string;
  };
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB límite de seguridad
const MAX_ROWS_PER_BATCH = 5000;

/**
 * Extrae entradas de un archivo ZIP (.xlsx / .xlsm) en memoria usando únicamente `node:zlib`,
 * ignorando cualquier binario ejecutable o macro (`vbaProject.bin`).
 */
function extractZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Buscar End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('El archivo Excel (.xlsx) no tiene una estructura ZIP válida.');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let i = 0; i < totalEntries && ptr < buf.length; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const fileName = buf.subarray(ptr + 46, ptr + 46 + fileNameLen).toString('utf8');

    ptr += 46 + fileNameLen + extraLen + commentLen;

    // Seguridad: ignorar explícitamente macros VBA (`vbaProject.bin`) o controles ActiveX
    if (
      fileName.toLowerCase().includes('vbaproject') ||
      fileName.toLowerCase().includes('activex')
    ) {
      continue;
    }

    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(fileName, compressedData);
    } else if (compressionMethod === 8) {
      entries.set(fileName, zlib.inflateRawSync(compressedData));
    }
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseXlsxBuffer(buf: Buffer, preferredSheet?: string): ParsedFileResult {
  const entries = extractZipEntries(buf);

  // 1. Leer sharedStrings.xml
  const sharedStrings: string[] = [];
  const ssXml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (ssXml) {
    const siMatches = ssXml.match(/<si[\s>][\s\S]*?<\/si>/g) ?? [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? [];
      const text = tMatches
        .map((t) => decodeXmlEntities(t.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
        .join('');
      sharedStrings.push(text.trim());
    }
  }

  // 2. Leer relaciones de workbook (xl/_rels/workbook.xml.rels) y nombres de hojas (xl/workbook.xml)
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const relTargetById = new Map<string, string>();
  const relMatches = relsXml.match(/<Relationship\s+[^>]*\/?>/g) ?? [];
  for (const rel of relMatches) {
    const idMatch = rel.match(/\bId="([^"]+)"/);
    const targetMatch = rel.match(/\bTarget="([^"]+)"/);
    if (idMatch && targetMatch) {
      const cleanTarget = targetMatch[1].replace(/^\/?xl\//, '').replace(/^\//, '');
      relTargetById.set(idMatch[1], `xl/${cleanTarget}`);
    }
  }

  const wbXml = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const sheetDefs: Array<{ name: string; entryPath: string }> = [];
  const sheetTagMatches = wbXml.match(/<sheet\s+[^>]*\/?>/g) ?? [];
  for (let i = 0; i < sheetTagMatches.length; i++) {
    const tag = sheetTagMatches[i];
    const nameMatch = tag.match(/\bname="([^"]+)"/);
    const rIdMatch = tag.match(/\br:id="([^"]+)"/);
    const sheetName = nameMatch ? decodeXmlEntities(nameMatch[1]) : `Hoja${i + 1}`;
    const entryPath =
      (rIdMatch && relTargetById.get(rIdMatch[1])) || `xl/worksheets/sheet${i + 1}.xml`;
    if (entries.has(entryPath)) {
      sheetDefs.push({ name: sheetName, entryPath });
    }
  }

  if (sheetDefs.length === 0) {
    for (const key of entries.keys()) {
      if (key.startsWith('xl/worksheets/sheet') && key.endsWith('.xml')) {
        sheetDefs.push({ name: path.basename(key, '.xml'), entryPath: key });
      }
    }
  }

  if (sheetDefs.length === 0) {
    throw new Error('No se encontraron hojas de cálculo legibles en el archivo Excel.');
  }

  const chosen =
    sheetDefs.find((s) => s.name === preferredSheet) ??
    sheetDefs.find((s) => /personal|emplead|legajo|nomina|empresa/i.test(s.name)) ??
    sheetDefs[0];

  const sheetXml = entries.get(chosen.entryPath)?.toString('utf8') ?? '';
  const rawRows: string[][] = [];

  const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c\s+[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? [];
    for (const cXml of cellMatches) {
      const refMatch = cXml.match(/\br="([A-Z]+)\d+"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : cells.length;
      const typeMatch = cXml.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let val = '';
      if (cellType === 'inlineStr') {
        const tMatch = cXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        val = tMatch ? decodeXmlEntities(tMatch[1]) : '';
      } else {
        const vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          val = sharedStrings[Number(rawV)] ?? rawV;
        } else {
          val = rawV;
        }
      }
      cells[colIdx] = val.trim();
    }
    if (cells.some((c) => c && c.trim().length > 0)) {
      rawRows.push(cells);
    }
  }

  // Detectar la fila de encabezado (primera fila con al menos 2 celdas con texto significativo)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const nonEmpty = rawRows[i].filter((c) => c && c.trim().length > 0);
    const hasKeyword = nonEmpty.some((c) =>
      /legajo|apellido|nombre|cuil|cuit|dni|categoria|ingreso|razon/i.test(c),
    );
    if (hasKeyword || nonEmpty.length >= 3) {
      headerRowIdx = i;
      if (hasKeyword) break;
    }
  }

  const headerRow = rawRows[headerRowIdx] ?? [];
  const maxCols = Math.max(
    headerRow.length,
    ...rawRows.slice(headerRowIdx + 1).map((r) => r.length),
  );
  const headers: string[] = [];
  for (let c = 0; c < maxCols; c++) {
    const h = (headerRow[c] ?? '').trim();
    headers.push(h || `Columna_${c + 1}`);
  }

  const dataRows: Array<Record<string, string>> = [];
  for (let r = headerRowIdx + 1; r < rawRows.length && dataRows.length < MAX_ROWS_PER_BATCH; r++) {
    const rowArr = rawRows[r];
    const obj: Record<string, string> = {};
    let nonEmptyCount = 0;
    for (let c = 0; c < headers.length; c++) {
      const cellVal = (rowArr[c] ?? '').trim();
      obj[headers[c]] = cellVal;
      if (cellVal.length > 0) nonEmptyCount++;
    }
    if (nonEmptyCount >= 2) {
      dataRows.push(obj);
    }
  }

  return {
    fileFormat: 'XLSX',
    sizeBytes: buf.length,
    sheetNames: sheetDefs.map((s) => s.name),
    selectedSheet: chosen.name,
    headers,
    rows: dataRows,
  };
}

import path from 'node:path';

function parseCsvBuffer(buf: Buffer, fileName: string): ParsedFileResult {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('El archivo CSV está vacío.');
  }

  // Detectar delimitador (';', ',' o '\t')
  const firstLine = lines[0];
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabs > semicolons && tabs > commas ? '\t' : semicolons >= commas ? ';' : ',';

  const splitCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCsvLine(lines[0]).map((h, idx) => h || `Columna_${idx + 1}`);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length && rows.length < MAX_ROWS_PER_BATCH; i++) {
    const values = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    let hasContent = false;
    for (let c = 0; c < headers.length; c++) {
      const val = (values[c] ?? '').trim();
      obj[headers[c]] = val;
      if (val.length > 0) hasContent = true;
    }
    if (hasContent) {
      rows.push(obj);
    }
  }

  return {
    fileFormat: 'CSV',
    sizeBytes: buf.length,
    sheetNames: [path.basename(fileName)],
    selectedSheet: path.basename(fileName),
    headers,
    rows,
  };
}

/**
 * Extrae texto seleccionable de un archivo PDF (tanto streams en claro como comprimidos con FlateDecode)
 * y aplica reglas de extracción estructurada para legajos de empleados y constancias de empresas.
 * Si el documento es escaneado (imagen sin texto), marca `requiresOcrOrManualReview = true`.
 */
function parsePdfBuffer(buf: Buffer, importKind: string): ParsedFileResult {
  const headerSig = buf.subarray(0, 5).toString('ascii');
  if (headerSig !== '%PDF-') {
    throw new Error('El archivo no posee una firma %PDF- válida.');
  }

  const textChunks: string[] = [];
  const rawAscii = buf.toString('latin1');

  // 1. Extraer bloques stream ... endstream y descomprimir FlateDecode si corresponde
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawAscii)) !== null) {
    const rawStreamBytes = Buffer.from(match[1], 'latin1');
    let decodedText = '';
    try {
      const inflated = zlib.inflateSync(rawStreamBytes);
      decodedText = inflated.toString('latin1');
    } catch {
      decodedText = match[1];
    }

    // Extraer literales de texto PDF entre paréntesis: (Texto) Tj o [(Texto)] TJ
    const literalMatches = decodedText.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
    for (const lit of literalMatches) {
      const inner = lit
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (/[a-zA-Z0-9ÁÉÍÓÚÑáéíóúñ]/.test(inner)) {
        textChunks.push(inner);
      }
    }
  }

  const extractedRawText = textChunks.join('\n').trim();
  const hasSelectableText = extractedRawText.length >= 10;

  if (importKind === 'PDF_COMPANIES') {
    const headers = ['CUIT', 'Razón Social', 'Nombre Comercial', 'Domicilio', 'Localidad', 'Provincia', 'Actividad'];
    const rows: Array<Record<string, string>> = [];

    if (!hasSelectableText) {
      // PDF escaneado sin texto seleccionable -> Crear fila para revisión manual asistida
      rows.push({
        CUIT: '',
        'Razón Social': '',
        'Nombre Comercial': '',
        Domicilio: '',
        Localidad: 'Córdoba',
        Provincia: 'Córdoba',
        Actividad: '',
      });
    } else {
      const cuitMatch = extractedRawText.match(/\b(20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d\b/);
      const razonMatch = extractedRawText.match(/(?:Raz[oó]n Social|Denominaci[oó]n|Empleador)\s*[:\-]\s*([^\n\r]+)/i);
      const domMatch = extractedRawText.match(/(?:Domicilio|Direcci[oó]n)\s*[:\-]\s*([^\n\r]+)/i);
      const actMatch = extractedRawText.match(/(?:Actividad)\s*[:\-]\s*([^\n\r]+)/i);

      rows.push({
        CUIT: cuitMatch ? cuitMatch[0].replace(/\D/g, '') : '',
        'Razón Social': razonMatch ? razonMatch[1].trim() : '',
        'Nombre Comercial': '',
        Domicilio: domMatch ? domMatch[1].trim() : '',
        Localidad: 'Córdoba',
        Provincia: 'Córdoba',
        Actividad: actMatch ? actMatch[1].trim() : 'Industria Metalúrgica',
      });
    }

    return {
      fileFormat: 'PDF',
      sizeBytes: buf.length,
      sheetNames: ['Documento PDF'],
      selectedSheet: 'Documento PDF',
      headers,
      rows,
      pdfMetadata: {
        hasSelectableText,
        requiresOcrOrManualReview: !hasSelectableText,
        extractedRawText,
      },
    };
  }

  // Extracción de Empleados desde PDF (listados de personal, fichas o constancias de CUIL)
  const headers = [
    'Legajo',
    'Apellido',
    'Nombre',
    'CUIL',
    'DNI',
    'Fecha de ingreso',
    'Puesto',
    'Categoría',
  ];
  const rows: Array<Record<string, string>> = [];

  if (!hasSelectableText) {
    rows.push({
      Legajo: '',
      Apellido: '',
      Nombre: '',
      CUIL: '',
      DNI: '',
      'Fecha de ingreso': '',
      Puesto: '',
      Categoría: '',
    });
  } else {
    const lines = extractedRawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Buscar filas tabulares que contengan un CUIL (XX-XXXXXXXX-X o 11 dígitos)
    const cuilRegex = /\b((?:20|23|24|27)\d{8}\d|(?:20|23|24|27)-\d{8}-\d)\b/;
    let matchedStructuredRows = 0;

    for (const line of lines) {
      if (/^\s*(?:CUIL|C\.U\.I\.L\.|CUIT)\s*[:\-]/i.test(line)) continue;
      const m = line.match(cuilRegex);
      if (!m) continue;
      const cleanCuil = m[1].replace(/\D/g, '');
      const dni = cleanCuil.slice(2, 10);
      const dateMatch = line.match(/\b(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/);
      const legajoMatch = line.match(/^\s*(\d{1,5})\b/);

      // Extraer nombre quitando CUIL, fecha y legajo
      const namePart = line
        .replace(m[0], ' ')
        .replace(dateMatch ? dateMatch[0] : '', ' ')
        .replace(/^\s*\d{1,5}\b/, ' ')
        .trim();

      let lastName = '';
      let firstName = '';
      if (namePart.includes(',')) {
        const [l, f] = namePart.split(',').map((s) => s.trim());
        lastName = l ?? '';
        firstName = f ?? '';
      } else {
        const parts = namePart.split(/\s+/).filter(Boolean);
        lastName = parts[0] ?? '';
        firstName = parts.slice(1).join(' ');
      }

      rows.push({
        Legajo: legajoMatch ? legajoMatch[1] : String(rows.length + 1),
        Apellido: lastName,
        Nombre: firstName,
        CUIL: cleanCuil,
        DNI: dni,
        'Fecha de ingreso': dateMatch ? dateMatch[1] : '',
        Puesto: 'Operario',
        Categoría: 'Oficial Múltiple',
      });
      matchedStructuredRows++;
    }

    // 2. Si es una ficha individual con etiquetas clave:valor ("Apellido: ...", "CUIL: ...")
    if (matchedStructuredRows === 0) {
      const cuilM = extractedRawText.match(/(?:CUIL|C\.U\.I\.L\.)\s*[:\-]?\s*([0-9\-]{11,13})/i);
      const legM = extractedRawText.match(/(?:Legajo)\s*[:\-]?\s*(\d+)/i);
      const apeM = extractedRawText.match(/(?:Apellido)\s*[:\-]?\s*([^\n\r,;]+)/i);
      const nomM = extractedRawText.match(/(?:Nombre|Nombres)\s*[:\-]?\s*([^\n\r,;]+)/i);
      const fecM = extractedRawText.match(/(?:Ingreso|Fecha de Ingreso)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
      const catM = extractedRawText.match(/(?:Categor[ií]a)\s*[:\-]?\s*([^\n\r,;]+)/i);
      const pueM = extractedRawText.match(/(?:Puesto|Cargo)\s*[:\-]?\s*([^\n\r,;]+)/i);

      const cleanCuil = cuilM ? cuilM[1].replace(/\D/g, '') : '';
      rows.push({
        Legajo: legM ? legM[1].trim() : '1',
        Apellido: apeM ? apeM[1].trim() : '',
        Nombre: nomM ? nomM[1].trim() : '',
        CUIL: cleanCuil,
        DNI: cleanCuil.length === 11 ? cleanCuil.slice(2, 10) : '',
        'Fecha de ingreso': fecM ? fecM[1].trim() : '',
        Puesto: pueM ? pueM[1].trim() : 'Operario',
        Categoría: catM ? catM[1].trim() : 'Oficial Múltiple',
      });
    }
  }

  return {
    fileFormat: 'PDF',
    sizeBytes: buf.length,
    sheetNames: ['Documento PDF'],
    selectedSheet: 'Documento PDF',
    headers,
    rows,
    pdfMetadata: {
      hasSelectableText,
      requiresOcrOrManualReview: !hasSelectableText,
      extractedRawText,
    },
  };
}

export function parseUploadedFile(params: {
  fileName: string;
  base64Content: string;
  importKind: string;
  selectedSheet?: string;
}): ParsedFileResult {
  const buf = Buffer.from(params.base64Content, 'base64');
  if (buf.length === 0) {
    throw new Error('El archivo recibido está vacío.');
  }
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error('El archivo excede el tamaño máximo permitido (15 MB).');
  }

  const lowerName = params.fileName.toLowerCase();

  // Verificar por firma binaria real (magic bytes) además de extensión
  const isPdfMagic = buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
  const isZipMagic = buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;

  if (isPdfMagic || lowerName.endsWith('.pdf') || params.importKind.startsWith('PDF_')) {
    return parsePdfBuffer(buf, params.importKind);
  }

  if (isZipMagic || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm')) {
    return parseXlsxBuffer(buf, params.selectedSheet);
  }

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt')) {
    return parseCsvBuffer(buf, params.fileName);
  }

  throw new Error(
    `Formato de archivo no soportado o contenido inválido (${params.fileName}). Utilice archivos .xlsx, .csv o .pdf.`,
  );
}
