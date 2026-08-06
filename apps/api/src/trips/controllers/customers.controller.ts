import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { TenantContext } from '../../tenants/context/tenant-context';
import { TRIP_READ_ROLES, TRIP_WRITE_ROLES } from '../constants/trip-roles.constants';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { FindCustomersQueryDto } from '../dto/find-customers-query.dto';
import { CustomerEntity } from '../entities/customer.entity';
import { PaginatedCustomersEntity } from '../entities/paginated-customers.entity';
import { CustomersService } from '../services/customers.service';

// Cadastro minimo de clientes (pre-requisito de Trip.customerId). Gestao
// completa (editar/desativar) fica para uma fase dedicada de Clientes.
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Lista clientes da empresa (busca, paginacao).' })
  @ApiOkResponse({ type: PaginatedCustomersEntity })
  findAll(@Query() query: FindCustomersQueryDto): Promise<PaginatedCustomersEntity> {
    return this.customersService.findAll(this.tenantContext.requireTenantId(), query);
  }

  @Get(':id')
  @Roles(...TRIP_READ_ROLES)
  @ApiOperation({ summary: 'Consulta um cliente da empresa.' })
  @ApiOkResponse({ type: CustomerEntity })
  @ApiNotFoundResponse({ description: 'Cliente nao encontrado nesta empresa.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerEntity> {
    return this.customersService.findOne(this.tenantContext.requireTenantId(), id);
  }

  @Post()
  @Roles(...TRIP_WRITE_ROLES)
  @ApiOperation({ summary: 'Cadastra um cliente (embarcador).' })
  @ApiCreatedResponse({ type: CustomerEntity })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerEntity> {
    return this.customersService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
