import { PartialType } from '@nestjs/swagger';
import { CreateTireDto } from './create-tire.dto';

// Edicao de cadastro apenas -- status/localizacao mudam somente atraves
// dos endpoints dedicados (movimentacao/recapagem/descarte), nunca por
// aqui, para preservar o historico automatico dessas transicoes.
export class UpdateTireDto extends PartialType(CreateTireDto) {}
