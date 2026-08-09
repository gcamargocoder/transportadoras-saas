import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

// Fecha uma excecao de eixo (praca ultrapassada) -- a partir daqui a
// configuracao operacional "volta" a ser a padrao (implicito, sem exigir
// nenhuma acao do motorista alem de encerrar o evento).
export class CloseAxleEventDto {
  @ApiProperty()
  @IsDateString({}, { message: 'endedAt deve ser uma data valida (ISO 8601).' })
  endedAt!: string;
}
