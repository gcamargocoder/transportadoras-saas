import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TOLL_READ_ROLES } from '../constants/toll-roles.constants';
import { CreateTollPlazaDto } from '../dto/create-toll-plaza.dto';
import { FindTollPlazasQueryDto } from '../dto/find-toll-plazas-query.dto';
import { UpdateTollPlazaDto } from '../dto/update-toll-plaza.dto';
import { PaginatedTollPlazasEntity } from '../entities/paginated-toll-plazas.entity';
import { TollPlazaEntity } from '../entities/toll-plaza.entity';
import { TollPlazasService } from '../services/toll-plazas.service';

// Dado de referencia GLOBAL (sem isolamento por tenant) -- leitura aberta a
// qualquer usuario autenticado (necessaria para registrar transacoes de
// pedagio); escrita restrita a SUPER_ADMIN (mesmo padrao de TagProvider).
@ApiTags('toll-plazas')
@ApiBearerAuth()
@Controller('toll-plazas')
export class TollPlazasController {
  constructor(
    private readonly tollPlazasService: TollPlazasService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({
    summary: 'Lista pracas de pedagio (busca, filtro por UF/operadora, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTollPlazasEntity })
  findAll(@Query() query: FindTollPlazasQueryDto): Promise<PaginatedTollPlazasEntity> {
    return this.tollPlazasService.findAll(query);
  }

  @Get(':id')
  @Roles(...TOLL_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma praca de pedagio.' })
  @ApiOkResponse({ type: TollPlazaEntity })
  @ApiNotFoundResponse({ description: 'Praca nao encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TollPlazaEntity> {
    return this.tollPlazasService.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Cadastra uma praca de pedagio.' })
  @ApiCreatedResponse({ type: TollPlazaEntity })
  create(@Body() dto: CreateTollPlazaDto): Promise<TollPlazaEntity> {
    return this.tollPlazasService.create(
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Atualiza dados de uma praca de pedagio.' })
  @ApiOkResponse({ type: TollPlazaEntity })
  @ApiNotFoundResponse({ description: 'Praca nao encontrada.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTollPlazaDto,
  ): Promise<TollPlazaEntity> {
    return this.tollPlazasService.update(
      id,
      dto,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      '[Super Admin] Exclui uma praca -- somente se nao houver transacoes/tarifas/previsoes vinculadas.',
  })
  @ApiNoContentResponse({ description: 'Praca excluida.' })
  @ApiNotFoundResponse({ description: 'Praca nao encontrada.' })
  @ApiConflictResponse({ description: 'Existem registros vinculados a esta praca.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tollPlazasService.remove(
      id,
      this.tenantContext.requireTenantId(),
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
