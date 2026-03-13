import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getDb, initDatabase } from './core/db';
import { getCategories, getTransactions } from './database';
import { debtService } from './debtService';
import { incomeService } from './incomeService';
import { insightsService } from './insightsService';
import { savingsService } from './savingsService';

type SheetCell = string | number | boolean | Date | null | undefined;
type Sheet = {
    name: string;
    rows: SheetCell[][];
};

export type ExportPeriod = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'CURRENT_YEAR' | 'ALL_TIME';

export type CsvExportResult = {
    location: string;
    files: number;
    periodLabel: string;
};

type ExportRange = {
    from: Date | null;
    to: Date | null;
    label: string;
    slug: string;
};

const xmlEscape = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const sanitizeSheetName = (name: string): string => {
    const cleaned = name.replace(/[\\/:?*\[\]]/g, ' ').trim();
    return cleaned.slice(0, 31) || 'Sheet';
};

const sanitizeXmlText = (value: string): string =>
    xmlEscape(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const normalizeSheetNames = (sheets: Sheet[]): string[] => {
    const seen = new Set<string>();
    return sheets.map((sheet, idx) => {
        const base = sanitizeSheetName(sheet.name || `Sheet${idx + 1}`);
        let candidate = base;
        let counter = 2;
        while (seen.has(candidate.toLowerCase())) {
            const suffix = ` ${counter}`;
            candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
            counter += 1;
        }
        seen.add(candidate.toLowerCase());
        return candidate;
    });
};

const columnIndexToName = (index: number): string => {
    let n = index + 1;
    let out = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out || 'A';
};

const STYLE_BASE = 0;
const STYLE_HEADER = 1;
const STYLE_ALT = 2;

const sheetCellToXlsx = (value: SheetCell, cellRef: string, styleIndex: number): string => {
    const styleAttr = ` s="${styleIndex}"`;
    if (value === null || value === undefined) return `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve"></t></is></c>`;
    if (value instanceof Date) {
        const text = sanitizeXmlText(value.toISOString());
        return `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${cellRef}"${styleAttr}><v>${value}</v></c>`;
    }
    if (typeof value === 'boolean') {
        const text = value ? 'Yes' : 'No';
        return `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }
    const text = sanitizeXmlText(String(value));
    return `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const looksLikeHeaderRow = (sheet: Sheet): boolean => {
    if (!sheet.rows.length) return false;
    const firstRow = sheet.rows[0];
    if (firstRow.length < 3) return false;
    return firstRow.every((cell) => typeof cell === 'string' || cell === null || cell === undefined);
};

const estimateColumnWidths = (sheet: Sheet): number[] => {
    const maxCols = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
    const widths = Array.from({ length: maxCols }, () => 10);

    for (const row of sheet.rows) {
        row.forEach((cell, colIndex) => {
            const text = cell === null || cell === undefined
                ? ''
                : cell instanceof Date
                    ? cell.toISOString().slice(0, 10)
                    : String(cell);
            const estimate = Math.min(44, Math.max(8, text.length + 2));
            widths[colIndex] = Math.max(widths[colIndex], estimate);
        });
    }
    return widths;
};

type ZipEntry = { path: string; content: string };

const utf8Encode = (input: string): Uint8Array => {
    const encoded = unescape(encodeURIComponent(input));
    const bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i += 1) {
        bytes[i] = encoded.charCodeAt(i);
    }
    return bytes;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let j = 0; j < 8; j += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc = (crc >>> 8) ^ crc32Table[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const remaining = bytes.length - i;
        const b0 = bytes[i++];
        const b1 = remaining > 1 ? bytes[i++] : 0;
        const b2 = remaining > 2 ? bytes[i++] : 0;

        const n = (b0 << 16) | (b1 << 8) | b2;
        out += chars[(n >> 18) & 63];
        out += chars[(n >> 12) & 63];
        out += remaining > 1 ? chars[(n >> 6) & 63] : '=';
        out += remaining > 2 ? chars[n & 63] : '=';
    }
    return out;
};

const setUint16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value & 0xffff, true);
const setUint32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value >>> 0, true);

const buildZipBase64 = (entries: ZipEntry[]): string => {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    entries.forEach((entry) => {
        const nameBytes = utf8Encode(entry.path);
        const dataBytes = utf8Encode(entry.content);
        const crc = crc32(dataBytes);

        const localHeaderBuffer = new ArrayBuffer(30);
        const localHeaderView = new DataView(localHeaderBuffer);
        setUint32(localHeaderView, 0, 0x04034b50);
        setUint16(localHeaderView, 4, 20);
        setUint16(localHeaderView, 6, 0);
        setUint16(localHeaderView, 8, 0);
        setUint16(localHeaderView, 10, 0);
        setUint16(localHeaderView, 12, 0);
        setUint32(localHeaderView, 14, crc);
        setUint32(localHeaderView, 18, dataBytes.length);
        setUint32(localHeaderView, 22, dataBytes.length);
        setUint16(localHeaderView, 26, nameBytes.length);
        setUint16(localHeaderView, 28, 0);
        const localHeaderBytes = new Uint8Array(localHeaderBuffer);

        localParts.push(localHeaderBytes, nameBytes, dataBytes);

        const centralHeaderBuffer = new ArrayBuffer(46);
        const centralHeaderView = new DataView(centralHeaderBuffer);
        setUint32(centralHeaderView, 0, 0x02014b50);
        setUint16(centralHeaderView, 4, 20);
        setUint16(centralHeaderView, 6, 20);
        setUint16(centralHeaderView, 8, 0);
        setUint16(centralHeaderView, 10, 0);
        setUint16(centralHeaderView, 12, 0);
        setUint16(centralHeaderView, 14, 0);
        setUint32(centralHeaderView, 16, crc);
        setUint32(centralHeaderView, 20, dataBytes.length);
        setUint32(centralHeaderView, 24, dataBytes.length);
        setUint16(centralHeaderView, 28, nameBytes.length);
        setUint16(centralHeaderView, 30, 0);
        setUint16(centralHeaderView, 32, 0);
        setUint16(centralHeaderView, 34, 0);
        setUint16(centralHeaderView, 36, 0);
        setUint32(centralHeaderView, 38, 0);
        setUint32(centralHeaderView, 42, offset);
        const centralHeaderBytes = new Uint8Array(centralHeaderBuffer);

        centralParts.push(centralHeaderBytes, nameBytes);
        offset += localHeaderBytes.length + nameBytes.length + dataBytes.length;
    });

    const localBytes = concatBytes(localParts);
    const centralBytes = concatBytes(centralParts);

    const endBuffer = new ArrayBuffer(22);
    const endView = new DataView(endBuffer);
    setUint32(endView, 0, 0x06054b50);
    setUint16(endView, 4, 0);
    setUint16(endView, 6, 0);
    setUint16(endView, 8, entries.length);
    setUint16(endView, 10, entries.length);
    setUint32(endView, 12, centralBytes.length);
    setUint32(endView, 16, localBytes.length);
    setUint16(endView, 20, 0);
    const endBytes = new Uint8Array(endBuffer);

    return bytesToBase64(concatBytes([localBytes, centralBytes, endBytes]));
};

const buildXlsxBase64 = (sheets: Sheet[]): string => {
    const names = normalizeSheetNames(sheets);
    const worksheetXmlList = sheets.map((sheet) => {
        const hasHeaderRow = looksLikeHeaderRow(sheet);
        const widths = estimateColumnWidths(sheet);
        const colsXml = widths.length > 0
            ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
            : '';
        const sheetViewXml = hasHeaderRow
            ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            : '';

        const rowsXml = sheet.rows
            .map((row, rowIndex) => {
                const rowStyle = hasHeaderRow && rowIndex === 0
                    ? STYLE_HEADER
                    : rowIndex % 2 === 0
                        ? STYLE_ALT
                        : STYLE_BASE;
                const cellsXml = row
                    .map((cell, colIndex) => {
                        const cellRef = `${columnIndexToName(colIndex)}${rowIndex + 1}`;
                        return sheetCellToXlsx(cell, cellRef, rowStyle);
                    })
                    .join('');
                if (hasHeaderRow && rowIndex === 0) {
                    return `<row r="${rowIndex + 1}" ht="24" customHeight="1">${cellsXml}</row>`;
                }
                return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
            })
            .join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${sheetViewXml}
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
    });

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${names.map((name, i) => `<sheet name="${sanitizeXmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
  <Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const entries: ZipEntry[] = [
        { path: '[Content_Types].xml', content: contentTypesXml },
        { path: '_rels/.rels', content: rootRelsXml },
        { path: 'xl/workbook.xml', content: workbookXml },
        { path: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
        { path: 'xl/styles.xml', content: stylesXml },
        ...worksheetXmlList.map((sheetXml, index) => ({
            path: `xl/worksheets/sheet${index + 1}.xml`,
            content: sheetXml,
        })),
    ];

    return buildZipBase64(entries);
};

const toIso = (value: Date | string | null | undefined): string =>
    value ? new Date(value).toISOString() : '';

const csvEscape = (value: SheetCell): string => {
    if (value === null || value === undefined) return '';
    const raw = value instanceof Date ? value.toISOString() : String(value);
    if (/[",\n]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
};

const sheetToCsv = (sheet: Sheet): string => {
    return sheet.rows.map((row) => row.map(csvEscape).join(',')).join('\n');
};

const sanitizeFileToken = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'sheet';

const atEndOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getExportRange = (period: ExportPeriod, now: Date = new Date()): ExportRange => {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);

    if (period === 'THIS_MONTH') {
        return { from: thisMonthStart, to: atEndOfDay(now), label: 'This Month', slug: 'this-month' };
    }

    if (period === 'LAST_MONTH') {
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { from, to, label: 'Last Month', slug: 'last-month' };
    }

    if (period === 'LAST_3_MONTHS') {
        const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { from, to: atEndOfDay(now), label: 'Last 3 Months', slug: 'last-3-months' };
    }

    if (period === 'CURRENT_YEAR') {
        return { from: thisYearStart, to: atEndOfDay(now), label: 'Current Year', slug: 'current-year' };
    }

    return { from: null, to: null, label: 'All Time', slug: 'all-time' };
};

const parseDate = (value: Date | string | null | undefined): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const inRange = (value: Date | string | null | undefined, range: ExportRange): boolean => {
    if (!range.from && !range.to) return true;
    const date = parseDate(value);
    if (!date) return false;
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    return true;
};

const monthIntersectsRange = (month: string, range: ExportRange): boolean => {
    if (!range.from && !range.to) return true;
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        return false;
    }
    const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    if (range.from && monthEnd < range.from) return false;
    if (range.to && monthStart > range.to) return false;
    return true;
};

const saveBinaryExportToDevice = async (
    base64Content: string,
    fileBaseName: string,
    extension: 'xlsx',
    mimeType: string
): Promise<string> => {
    if (!FileSystem.documentDirectory) {
        throw new Error('Document directory is not available on this device.');
    }

    const tempUri = `${FileSystem.documentDirectory}${fileBaseName}.${extension}`;
    await FileSystem.writeAsStringAsync(tempUri, base64Content, {
        encoding: FileSystem.EncodingType.Base64,
    });

    if (Platform.OS === 'android') {
        const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
        if (!permissions.granted) {
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
            throw new Error('Download cancelled. Please allow folder access to save the export file.');
        }

        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            `${fileBaseName}.${extension}`,
            mimeType
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, base64Content, {
            encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        return targetUri;
    }

    return tempUri;
};

const saveCsvWorkbookToDevice = async (
    sheets: Sheet[],
    fileBaseName: string,
    periodLabel: string
): Promise<{ location: string; files: number }> => {
    if (!FileSystem.documentDirectory) {
        throw new Error('Document directory is not available on this device.');
    }

    const normalizedBase = sanitizeFileToken(fileBaseName);
    const folderName = `${normalizedBase}-csv-workbook`;

    if (Platform.OS === 'android') {
        const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
        if (!permissions.granted) {
            throw new Error('Download cancelled. Please allow folder access to save the export files.');
        }

        let fileCount = 0;
        for (let i = 0; i < sheets.length; i += 1) {
            const sheet = sheets[i];
            const fileName = `${folderName}_${String(i + 1).padStart(2, '0')}_${sanitizeFileToken(sheet.name)}.csv`;
            const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                fileName,
                'text/csv'
            );

            const tempUri = `${FileSystem.documentDirectory}tmp-${Date.now()}-${i}.csv`;
            await FileSystem.writeAsStringAsync(tempUri, sheetToCsv(sheet), { encoding: FileSystem.EncodingType.UTF8 });
            const base64Content = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, base64Content, {
                encoding: FileSystem.EncodingType.Base64,
            });
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
            fileCount += 1;
        }

        const readmeName = `${folderName}_README.txt`;
        const readmeUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            readmeName,
            'text/plain'
        );
        const readmeText = [
            'Fanga Budget CSV Export',
            `Period: ${periodLabel}`,
            `Generated: ${new Date().toISOString()}`,
            `Files: ${fileCount}`,
        ].join('\n');
        const readmeTempUri = `${FileSystem.documentDirectory}tmp-${Date.now()}-readme.txt`;
        await FileSystem.writeAsStringAsync(readmeTempUri, readmeText, { encoding: FileSystem.EncodingType.UTF8 });
        const readmeBase64 = await FileSystem.readAsStringAsync(readmeTempUri, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(readmeUri, readmeBase64, {
            encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.deleteAsync(readmeTempUri, { idempotent: true });

        return { location: permissions.directoryUri, files: fileCount + 1 };
    }

    const folderUri = `${FileSystem.documentDirectory}${folderName}-${Date.now()}`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });

    for (let i = 0; i < sheets.length; i += 1) {
        const sheet = sheets[i];
        const fileName = `${String(i + 1).padStart(2, '0')}-${sanitizeFileToken(sheet.name)}.csv`;
        await FileSystem.writeAsStringAsync(`${folderUri}/${fileName}`, sheetToCsv(sheet), {
            encoding: FileSystem.EncodingType.UTF8,
        });
    }

    const readmeText = [
        'Fanga Budget CSV Export',
        `Period: ${periodLabel}`,
        `Generated: ${new Date().toISOString()}`,
        `Files: ${sheets.length}`,
    ].join('\n');
    await FileSystem.writeAsStringAsync(`${folderUri}/README.txt`, readmeText, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    return { location: folderUri, files: sheets.length + 1 };
};

const buildExportSheets = async (
    period: ExportPeriod = 'ALL_TIME'
): Promise<{ sheets: Sheet[]; generatedAt: Date; periodLabel: string }> => {
    await initDatabase();
    const db = getDb();
    const range = getExportRange(period);

    const allTransactions = await getTransactions();
    const transactions = allTransactions.filter((tx) => inRange(tx.date, range));
    const [categories, debts, savingsGoals, incomeSources, allIncomeLogs] = await Promise.all([
        getCategories(),
        debtService.getDebts('local_user'),
        savingsService.getGoals('local_user'),
        incomeService.getSources('local_user'),
        incomeService.getLogs(),
    ]);
    const incomeLogs = allIncomeLogs.filter((log) => inRange(log.receivedAt, range));

    const [keyMetrics, categoryTrends, allMonthlySummaries, allNetWorthHistory] = await Promise.all([
        insightsService.getKeyMetrics('local_user', transactions),
        insightsService.getCategoryTrends(transactions),
        insightsService.getMonthlySummaries(120),
        insightsService.getNetWorthHistory(3650),
    ]);
    const monthlySummaries = allMonthlySummaries.filter((m) => monthIntersectsRange(m.month, range));
    const netWorthHistory = allNetWorthHistory.filter((n) => inRange(n.date, range));

    const accounts = await db.getAllAsync<any>(
        'SELECT id, name, type, balance, currency, is_active, created_at, updated_at FROM accounts ORDER BY name ASC'
    );
    const automationRules = await db.getAllAsync<any>(
        'SELECT id, name, type, conditions, action, is_enabled FROM automation_rules ORDER BY id ASC'
    );
    const userSettings = await db.getAllAsync<any>(
        'SELECT key, value FROM user_settings ORDER BY key ASC'
    );
    const allBudgets = await db.getAllAsync<any>(
        'SELECT month, total_income FROM monthly_budgets ORDER BY month DESC'
    );
    const budgets = allBudgets.filter((b: any) => monthIntersectsRange(b.month, range));
    const allCategoryBudgets = await db.getAllAsync<any>(`
        SELECT cb.month, cb.category_id, c.name AS category_name, c.type AS category_type, cb.budget_amount
        FROM category_budgets cb
        LEFT JOIN categories c ON c.id = cb.category_id
        ORDER BY cb.month DESC, c.name ASC
    `);
    const categoryBudgets = allCategoryBudgets.filter((b: any) => monthIntersectsRange(b.month, range));
    const allDebtPayments = await db.getAllAsync<any>(`
        SELECT dp.id, dp.debt_id, dp.transaction_id, dp.amount, dp.date, dp.created_at, d.name AS debt_name
        FROM debt_payments dp
        LEFT JOIN debts d ON d.id = dp.debt_id
        ORDER BY dp.date DESC
    `);
    const debtPayments = allDebtPayments.filter((p: any) => inRange(p.date || p.created_at, range));

    const generatedAt = new Date();
    const sheets: Sheet[] = [
        {
            name: 'Overview',
            rows: [
                ['Generated At', generatedAt.toISOString()],
                ['Export Type', 'Full Financial Spreadsheet'],
                ['Period', range.label],
                ['Period Start', range.from ? range.from.toISOString() : 'All Time'],
                ['Period End', range.to ? range.to.toISOString() : 'All Time'],
                ['Note', 'Use Chart_* sheets to build charts in Excel/Sheets.'],
                [],
                ['Total Transactions', transactions.length],
                ['Total Categories', categories.length],
                ['Total Debts', debts.length],
                ['Total Savings Goals', savingsGoals.length],
                ['Total Income Sources', incomeSources.length],
                ['Total Income Logs', incomeLogs.length],
                [],
                ['This Month Income', keyMetrics.thisMonthIncome],
                ['This Month Expenses', keyMetrics.thisMonthExpenses],
                ['Last Month Income', keyMetrics.lastMonthIncome],
                ['Last Month Expenses', keyMetrics.lastMonthExpenses],
                ['Savings Rate %', keyMetrics.savingsRate],
                ['Debt-To-Income %', keyMetrics.debtToIncomeRatio],
                ['Spending Velocity (KES/day)', keyMetrics.spendingVelocity],
                ['Last Month Velocity (KES/day)', keyMetrics.lastMonthVelocity],
                ['Total Saved', keyMetrics.totalSaved],
                ['Total Savings Target', keyMetrics.totalSavingsTarget],
                ['Savings Progress %', keyMetrics.savingsProgress],
                ['Total Assets', keyMetrics.totalAssets],
                ['Total Liabilities', keyMetrics.totalLiabilities],
                ['Net Worth', keyMetrics.netWorth],
                ['Top Category', keyMetrics.topCategory?.name || ''],
                ['Top Category Amount', keyMetrics.topCategory?.amount || 0],
            ],
        },
        {
            name: 'Transactions',
            rows: [
                [
                    'ID',
                    'Date',
                    'Type',
                    'Kind',
                    'Amount',
                    'Cost',
                    'Account',
                    'Account Type',
                    'Category',
                    'Category ID',
                    'Recipient',
                    'Linked Debt ID',
                    'Linked Goal ID',
                    'Reference ID',
                    'Raw SMS',
                ],
                ...transactions.map((tx) => [
                    tx.id,
                    tx.date.toISOString(),
                    tx.type,
                    tx.transactionKind,
                    tx.amount,
                    tx.transactionCost || 0,
                    tx.accountName || '',
                    tx.accountType || '',
                    tx.categoryName || '',
                    tx.categoryId || '',
                    tx.recipientName || '',
                    tx.linkedDebtId || '',
                    tx.linkedGoalId || '',
                    tx.referenceId || '',
                    tx.rawSms || '',
                ]),
            ],
        },
        {
            name: 'Categories',
            rows: [
                ['ID', 'Name', 'Type', 'Icon', 'Color', 'Custom', 'Description'],
                ...categories.map((cat) => [
                    cat.id,
                    cat.name,
                    cat.type,
                    cat.icon,
                    cat.color,
                    cat.isCustom ? 'Yes' : 'No',
                    cat.description || '',
                ]),
            ],
        },
        {
            name: 'Accounts',
            rows: [
                ['ID', 'Name', 'Type', 'Balance', 'Currency', 'Active', 'Created At', 'Updated At'],
                ...accounts.map((acc: any) => [
                    acc.id,
                    acc.name,
                    acc.type,
                    acc.balance || 0,
                    acc.currency || 'KES',
                    acc.is_active === 1 ? 'Yes' : 'No',
                    toIso(acc.created_at),
                    toIso(acc.updated_at),
                ]),
            ],
        },
        {
            name: 'Debts',
            rows: [
                ['ID', 'Name', 'Type', 'Status', 'Principal', 'Current Balance', 'Interest Rate', 'Start Date', 'Due Date', 'Account ID'],
                ...debts.map((debt) => [
                    debt.id,
                    debt.name,
                    debt.type,
                    debt.status,
                    debt.principalAmount,
                    debt.currentBalance,
                    debt.interestRate || 0,
                    toIso(debt.startDate),
                    toIso(debt.dueDate),
                    debt.accountId || '',
                ]),
            ],
        },
        {
            name: 'Debt Payments',
            rows: [
                ['Payment ID', 'Debt ID', 'Debt Name', 'Transaction ID', 'Amount', 'Date', 'Created At'],
                ...debtPayments.map((p: any) => [
                    p.id,
                    p.debt_id,
                    p.debt_name || '',
                    p.transaction_id,
                    p.amount || 0,
                    toIso(p.date),
                    toIso(p.created_at),
                ]),
            ],
        },
        {
            name: 'Savings Goals',
            rows: [
                ['ID', 'Name', 'Status', 'Target Amount', 'Current Amount', 'Target Date', 'Color', 'Created At', 'Updated At'],
                ...savingsGoals.map((goal) => [
                    goal.id,
                    goal.name,
                    goal.status,
                    goal.targetAmount,
                    goal.currentAmount,
                    toIso(goal.targetDate),
                    goal.color || '',
                    toIso(goal.createdAt),
                    toIso(goal.updatedAt),
                ]),
            ],
        },
        {
            name: 'Income Sources',
            rows: [
                ['ID', 'Name', 'Status', 'Recurring', 'Frequency', 'Expected Amount', 'Last Received', 'Category ID', 'Color'],
                ...incomeSources.map((src) => [
                    src.id,
                    src.name,
                    src.status,
                    src.isRecurring ? 'Yes' : 'No',
                    src.frequency,
                    src.expectedAmount || 0,
                    toIso(src.lastReceived),
                    src.categoryId || '',
                    src.color || '',
                ]),
            ],
        },
        {
            name: 'Income Logs',
            rows: [
                ['ID', 'Source ID', 'Transaction ID', 'Amount', 'Received At', 'Notes', 'Created At'],
                ...incomeLogs.map((log) => [
                    log.id,
                    log.sourceId,
                    log.transactionId || '',
                    log.amount,
                    toIso(log.receivedAt),
                    log.notes || '',
                    toIso(log.createdAt),
                ]),
            ],
        },
        {
            name: 'Monthly Budgets',
            rows: [
                ['Month', 'Total Income'],
                ...budgets.map((b: any) => [b.month, b.total_income || 0]),
            ],
        },
        {
            name: 'Category Budgets',
            rows: [
                ['Month', 'Category ID', 'Category Name', 'Category Type', 'Budget Amount'],
                ...categoryBudgets.map((b: any) => [
                    b.month,
                    b.category_id,
                    b.category_name || '',
                    b.category_type || '',
                    b.budget_amount || 0,
                ]),
            ],
        },
        {
            name: 'Automation Rules',
            rows: [
                ['ID', 'Name', 'Type', 'Enabled', 'Conditions', 'Action'],
                ...automationRules.map((rule: any) => [
                    rule.id,
                    rule.name,
                    rule.type,
                    rule.is_enabled === 1 ? 'Yes' : 'No',
                    rule.conditions,
                    rule.action,
                ]),
            ],
        },
        {
            name: 'Settings',
            rows: [
                ['Key', 'Value'],
                ...userSettings.map((setting: any) => [setting.key, setting.value]),
            ],
        },
        {
            name: 'Chart_CategoryTrends',
            rows: [
                ['Category', 'This Month', 'Last Month', 'Trend', 'Percent Of Expenses'],
                ...categoryTrends.map((trend) => [
                    trend.categoryName,
                    trend.thisMonth,
                    trend.lastMonth,
                    trend.trend,
                    trend.percentOfExpenses,
                ]),
            ],
        },
        {
            name: 'Chart_MonthlySummary',
            rows: [
                ['Month', 'Total Income', 'Total Expenses', 'Total Savings', 'Net Worth Snapshot'],
                ...monthlySummaries.map((m) => [
                    m.month,
                    m.totalIncome,
                    m.totalExpenses,
                    m.totalSavings,
                    m.netWorthSnapshot,
                ]),
            ],
        },
        {
            name: 'Chart_NetWorth',
            rows: [
                ['Date', 'Net Worth'],
                ...netWorthHistory.map((n) => [n.date, n.netWorth]),
            ],
        },
    ];

    return { sheets, generatedAt, periodLabel: range.label };
};

export const exportFinancialSpreadsheet = async (period: ExportPeriod = 'ALL_TIME'): Promise<string> => {
    const { sheets, generatedAt } = await buildExportSheets(period);
    const workbookBase64 = buildXlsxBase64(sheets);
    const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    return saveBinaryExportToDevice(
        workbookBase64,
        `budget-export-${stamp}`,
        'xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
};

export const exportFinancialCsv = async (period: ExportPeriod = 'ALL_TIME'): Promise<CsvExportResult> => {
    const { sheets, generatedAt, periodLabel } = await buildExportSheets(period);
    const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    const result = await saveCsvWorkbookToDevice(sheets, `budget-export-${stamp}`, periodLabel);
    return {
        location: result.location,
        files: result.files,
        periodLabel,
    };
};
