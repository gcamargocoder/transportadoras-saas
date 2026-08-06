import { UserAccount } from '@prisma/client';
import { UserEntity } from '../entities/user.entity';

export function toUserEntity(user: UserAccount): UserEntity {
  const entity = new UserEntity();
  entity.id = user.id;
  entity.tenantId = user.tenantId;
  entity.name = user.name;
  entity.email = user.email;
  entity.role = user.role;
  entity.isActive = user.isActive;
  entity.createdAt = user.createdAt;
  entity.updatedAt = user.updatedAt;
  return entity;
}
