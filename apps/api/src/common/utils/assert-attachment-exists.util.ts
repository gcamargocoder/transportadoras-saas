import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Checagem reutilizada por qualquer modulo que aceite um vinculo opcional a
// um Attachment ja existente (TripExpense, TripRevenue, TripAdvance --
// nunca upload de arquivo aqui, apenas referencia a um registro do tenant).
export async function assertAttachmentExists(
  prisma: PrismaService,
  tenantId: string,
  attachmentId: string,
): Promise<void> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, tenantId },
  });
  if (!attachment) {
    throw new NotFoundException('Attachment (attachmentId) nao encontrado nesta empresa.');
  }
}
