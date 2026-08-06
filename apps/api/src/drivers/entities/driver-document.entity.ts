import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';

export class DriverDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ enum: DocumentType })
  type!: DocumentType;

  @ApiProperty({ nullable: true })
  number!: string | null;

  @ApiProperty({ nullable: true })
  issuedAt!: Date | null;

  @ApiProperty({ nullable: true })
  expiresAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
