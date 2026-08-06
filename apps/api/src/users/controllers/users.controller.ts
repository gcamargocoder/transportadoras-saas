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
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserEntity } from '../entities/user.entity';
import { UsersService } from '../services/users.service';

// Gestao de usuarios da PROPRIA empresa do usuario autenticado -- isolamento
// vem de TenantContext.requireTenantId(), nunca de um parametro de rota
// (nao existe /users?tenantId=... nem /tenants/:id/users).
@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista os usuarios da empresa do usuario autenticado.' })
  @ApiOkResponse({ type: UserEntity, isArray: true })
  findAll(): Promise<UserEntity[]> {
    return this.usersService.findAll(this.tenantContext.requireTenantId());
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo usuario na empresa do usuario autenticado.' })
  @ApiCreatedResponse({ type: UserEntity })
  @ApiConflictResponse({ description: 'Ja existe um usuario com este e-mail nesta empresa.' })
  create(@Body() dto: CreateUserDto): Promise<UserEntity> {
    return this.usersService.create(
      this.tenantContext.requireTenantId(),
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza dados de um usuario da empresa (opcionalmente redefine a senha).',
  })
  @ApiOkResponse({ type: UserEntity })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado nesta empresa.' })
  @ApiConflictResponse({ description: 'Ja existe um usuario com este e-mail nesta empresa.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserEntity> {
    return this.usersService.update(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Ativa ou desativa um usuario da empresa.' })
  @ApiOkResponse({ type: UserEntity })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado nesta empresa.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserEntity> {
    return this.usersService.updateStatus(
      this.tenantContext.requireTenantId(),
      id,
      dto,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui logicamente um usuario da empresa.' })
  @ApiNoContentResponse({ description: 'Usuario excluido.' })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado nesta empresa.' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.usersService.softDelete(
      this.tenantContext.requireTenantId(),
      id,
      { userId: this.tenantContext.requireUserId() },
      this.tenantContext.requestMetadata,
    );
  }
}
