// Entry point proprio (fora de node_modules) -- evita o bug de resolucao do
// Metro em monorepos pnpm onde `expo/AppEntry.js` (hospedado no
// node_modules/.pnpm da raiz) resolve seu `import App from '../../App'`
// relativo ao caminho REAL no pnpm store, nao ao symlink do pacote dentro de
// apps/driver-app -- import relativo aqui (`./App`) nunca atravessa um
// symlink, entao sempre resolve certo.
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
