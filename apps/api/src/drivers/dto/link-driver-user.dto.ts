import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Vincula um UserAccount JA EXISTENTE (login opcional do motorista no app)
// -- este DTO nunca cria usuario, apenas referencia um id existente no
// mesmo tenant.
export class LinkDriverUserDto {
  @ApiProperty({ format: 'uuid', description: 'Id de um UserAccount ja existente nesta empresa.' })
  @IsUUID('4', { message: 'userAccountId deve ser um UUID valido.' })
  userAccountId!: string;
}
