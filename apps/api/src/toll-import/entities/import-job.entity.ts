import { ApiProperty } from '@nestjs/swagger';
import { ImportFileType, ImportJobStatus } from '@prisma/client';

export class ImportJobEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty()
  providerName!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty({ enum: ImportFileType })
  fileType!: ImportFileType;

  @ApiProperty({ enum: ImportJobStatus })
  status!: ImportJobStatus;

  @ApiProperty()
  importedRecords!: number;

  @ApiProperty()
  ignoredRecords!: number;

  @ApiProperty()
  errorRecords!: number;

  @ApiProperty({ description: 'importedRecords + ignoredRecords + errorRecords.' })
  totalRecords!: number;

  @ApiProperty({ nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
