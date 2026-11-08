import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  publicDir: 'public-swa',
  plugins: [react(), {
    name: 'swa-product-boundary',
    apply: 'build',
    generateBundle() {
      const modules = [...this.getModuleIds()].map(id => relative(webRoot, id.split('?')[0]).replaceAll('\\', '/')).filter(id => id.startsWith('src/')).sort();
      const forbidden = modules.filter(id => /^src\/pages\/(attention|cognition)\//.test(id) || /^src\/pages\/swarm\/(missions|dag)\//.test(id) || ['src/App.tsx', 'src/api/client.ts', 'src/api/s1.ts', 'src/hooks/useAttention.ts', 'src/hooks/useReadApi.ts', 'src/pages/workspace/WorkspacePage.tsx', 'src/pages/workspace/relayWorksPage.tsx', 'src/pages/swarm/SwarmPage.tsx'].includes(id));
      if (forbidden.length) this.error(`SWA 构建包含其他产品模块：${forbidden.join(', ')}`);
      this.emitFile({ type: 'asset', fileName: '.vite/swa-modules.json', source: JSON.stringify({ schema: 'swa.web-modules.v1', modules }, null, 2) });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.ASTROCYTE_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.ASTROCYTE_PORT ?? 8787}` },
  },
});
