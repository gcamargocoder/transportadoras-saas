import { BadRequestException } from '@nestjs/common';
import { ImportFileType } from '@prisma/client';
import { TollImportParser } from '../interfaces/toll-import-parser.interface';
import { CsvTollImportParser } from './csv-toll-import.parser';
import { XlsxTollImportParser } from './xlsx-toll-import.parser';

// Unico ponto de escolha do parser real por formato. ImportFileType ja
// modela XML/TXT/API_INTEGRATION para o futuro (ver schema.prisma) -- ligar
// um novo formato e so adicionar um `case` aqui, sem tocar em
// TollImportService.
export function getTollImportParser(fileType: ImportFileType): TollImportParser {
  switch (fileType) {
    case ImportFileType.CSV:
      return new CsvTollImportParser();
    case ImportFileType.XLSX:
      return new XlsxTollImportParser();
    default:
      throw new BadRequestException(
        `Formato de arquivo "${fileType}" ainda nao possui suporte de importacao implementado.`,
      );
  }
}
