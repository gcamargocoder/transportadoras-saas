import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';

// Marca uma rota como publica -- o JwtAuthGuard global (APP_GUARD) le essa
// metadata via Reflector e libera a rota sem exigir access token.
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
