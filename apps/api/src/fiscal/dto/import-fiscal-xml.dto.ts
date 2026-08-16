import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// O arquivo XML chega via multipart (@UploadedFile(), fora deste DTO).
// documentType/documentNumber/accessKey/series/issueDate/sender/recipient
// NUNCA sao aceitos aqui -- sempre extraidos do XML pelo parser tolerante
// (ver fiscal-xml.parser.ts). Vinculo operacional continua opcional e
// informado pelo cliente (o XML nao sabe a qual viagem/veiculo pertence).
export class ImportFiscalXmlDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo com a viagem, quando aplicavel.' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;
}
