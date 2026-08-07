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
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import {
  TRIP_EXPENSE_APPROVAL_ROLES,
  TRIP_EXPENSE_READ_ROLES,
  TRIP_EXPENSE_WRITE_ROLES,
} from '../constants/trip-expense-roles.constants';
import { CreateTripExpenseDto } from '../dto/create-trip-expense.dto';
import { FindTripExpensesQueryDto } from '../dto/find-trip-expenses-query.dto';
import { UpdateTripExpenseStatusDto } from '../dto/update-trip-expense-status.dto';
import { UpdateTripExpenseDto } from '../dto/update-trip-expense.dto';
import { PaginatedTripExpensesEntity } from '../entities/paginated-trip-expenses.entity';
import { TripExpenseEntity } from '../entities/trip-expense.entity';
import { TripExpensesService } from '../services/trip-expenses.service';

@ApiTags('trip-expenses')
@ApiBearerAuth()
@Controller('trip-expenses')
export class TripExpensesController {
  constructor(
    private readonly tripExpensesService: TripExpensesService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_EXPENSE_READ_ROLES)
  @ApiOperation({
    summary:
      'Lista despesas de viagem da empresa (filtro por viagem/categoria/status/motorista/' +
      'veiculo/fornecedor/periodo/faixa de valor, paginacao, ordenacao).',
  })
  @ApiOkResponse({ type: PaginatedTripExpensesEntity })
  findAll(@Query() query: FindTripExpensesQueryDto): Promise<PaginatedTripExpensesEntity> {
    return this.tripExpensesService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_EXPENSE_READ_ROLES)
  @ApiOperation({ summary: 'Consulta uma despesa de viagem.' })
  @ApiOkResponse({ type: TripExpenseEntity })
  @ApiNotFoundResponse({ description: 'Despesa nao encontrada nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TripExpenseEntity> {
    return this.tripExpensesService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_EXPENSE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Registra uma despesa de viagem. Motorista e veiculo sao derivados automaticamente da ' +
      'viagem; status inicial e sempre PENDING.',
  })
  @ApiCreatedResponse({ type: TripExpenseEntity })
  @ApiNotFoundResponse({ description: 'Viagem ou attachment nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Viagem cancelada nao aceita novas despesas.' })
  create(@Body() dto: CreateTripExpenseDto): Promise<TripExpenseEntity> {
    return this.tripExpensesService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @Roles(...TRIP_EXPENSE_WRITE_ROLES)
  @ApiOperation({
    summary:
      'Atualiza os dados de uma despesa (somente enquanto status = PENDING). Para aprovar, ' +
      'rejeitar ou cancelar, use PATCH /trip-expenses/:id/status.',
  })
  @ApiOkResponse({ type: TripExpenseEntity })
  @ApiNotFoundResponse({ description: 'Despesa ou attachment nao encontrados nesta empresa.' })
  @ApiConflictResponse({ description: 'Despesa nao esta mais em PENDING.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripExpenseDto,
  ): Promise<TripExpenseEntity> {
    return this.tripExpensesService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @Roles(...TRIP_EXPENSE_APPROVAL_ROLES)
  @ApiOperation({
    summary:
      'Aprova, rejeita ou cancela uma despesa (perfil de gestao). PENDING -> APPROVED/REJECTED/' +
      'CANCELLED; APPROVED/REJECTED -> CANCELLED.',
  })
  @ApiOkResponse({ type: TripExpenseEntity })
  @ApiNotFoundResponse({ description: 'Despesa nao encontrada nesta empresa.' })
  @ApiConflictResponse({ description: 'Transicao de status nao permitida.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripExpenseStatusDto,
  ): Promise<TripExpenseEntity> {
    return this.tripExpensesService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @Roles(...TRIP_EXPENSE_APPROVAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma despesa de viagem (perfil de gestao).' })
  @ApiNoContentResponse({ description: 'Despesa excluida.' })
  @ApiNotFoundResponse({ description: 'Despesa nao encontrada nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tripExpensesService.remove(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
