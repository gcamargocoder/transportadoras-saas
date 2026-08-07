import { ApiProperty } from '@nestjs/swagger';
import { ImportRowIssueType } from '@prisma/client';

export class ImportJobErrorEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  importJobId!: string;

  @ApiProperty({ description: 'Numero da linha no arquivo original (cabecalho = linha 1).' })
  rowNumber!: number;

  @ApiProperty({ enum: ImportRowIssueType })
  issueType!: ImportRowIssueType;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: Object, description: 'Snapshot da linha original do arquivo.' })
  rawData!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;
}
