import { parse } from 'csv-parse/sync';
import { RawImportRow, TollImportParser } from '../interfaces/toll-import-parser.interface';

export class CsvTollImportParser implements TollImportParser {
  parse(buffer: Buffer): Promise<RawImportRow[]> {
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      // Extratos de operadoras brasileiras usam tanto "," quanto ";" como
      // separador -- csv-parse detecta automaticamente qual usar.
      delimiter: [',', ';'],
    }) as RawImportRow[];
    return Promise.resolve(records);
  }
}
