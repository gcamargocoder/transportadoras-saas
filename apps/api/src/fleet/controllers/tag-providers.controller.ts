import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FLEET_READ_ROLES } from '../constants/fleet-roles.constants';
import { TagProviderEntity } from '../entities/tag-provider.entity';
import { TagProvidersService } from '../services/tag-providers.service';

// Dado de referencia GLOBAL (sem isolamento por tenant) -- lista as
// operadoras disponiveis para vincular em POST /vehicles/:id/tags.
@ApiTags('tag-providers')
@ApiBearerAuth()
@Controller('tag-providers')
export class TagProvidersController {
  constructor(private readonly tagProvidersService: TagProvidersService) {}

  @Get()
  @Roles(...FLEET_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista as operadoras de tag de pedagio disponiveis (Sem Parar, ConectCar, Veloe, Move Mais...).',
  })
  @ApiOkResponse({ type: TagProviderEntity, isArray: true })
  findAll(): Promise<TagProviderEntity[]> {
    return this.tagProvidersService.findAll();
  }
}
