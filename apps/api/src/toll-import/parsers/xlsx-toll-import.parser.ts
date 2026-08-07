import ExcelJS from 'exceljs';
import { RawImportRow, TollImportParser } from '../interfaces/toll-import-parser.interface';

export class XlsxTollImportParser implements TollImportParser {
  async parse(buffer: Buffer): Promise<RawImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    // Cast necessario: o pnpm instala uma copia isolada de @types/node para
    // exceljs, cujo `Buffer` nao e estruturalmente identico ao `Buffer`
    // global usado no resto do projeto -- sem afetar o tipo real em tempo
    // de execucao (ambos sao o mesmo Buffer do Node).
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return [];
    }

    let headers: string[] = [];
    const rows: RawImportRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      const values = (row.values as unknown[]).slice(1).map((value) => this.cellToString(value));

      if (rowNumber === 1) {
        headers = values;
        return;
      }
      if (values.every((value) => value.trim() === '')) {
        return;
      }

      const record: RawImportRow = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? '';
      });
      rows.push(record);
    });

    return rows;
  }

  private cellToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
      return String((value as { text: unknown }).text ?? '');
    }
    if (typeof value === 'object' && 'result' in (value as Record<string, unknown>)) {
      return String((value as { result: unknown }).result ?? '');
    }
    return String(value);
  }
}
