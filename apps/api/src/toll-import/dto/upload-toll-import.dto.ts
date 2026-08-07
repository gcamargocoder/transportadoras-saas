import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// O arquivo em si chega via multipart (@UploadedFile(), fora deste DTO) --
// aqui so o campo de formulario que acompanha o upload. fileType NAO e
// aceito do cliente: e sempre derivado da extensao do arquivo enviado (ver
// TollImportService.resolveFileType), para nao permitir que o rotulo
// declarado divirja do conteudo real.
export class UploadTollImportDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Operadora (TagProvider) responsavel pelo extrato importado.',
  })
  @IsUUID('4', { message: 'providerId deve ser um UUID valido.' })
  providerId!: string;
}
