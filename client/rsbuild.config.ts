import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

export default defineConfig({
  plugins: [pluginVue()],
  source: {
    entry: {
      pilot:     './src/pages/pilot/index.ts',
      commander: './src/pages/commander/index.ts',
      history:   './src/pages/history/index.ts',
      login:     './src/pages/login/index.ts',
    },
  },
  html: {
    template({ entryName }) {
      return `./src/pages/${entryName}/index.html`;
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/sub':  'http://localhost:80',
    },
  },
});
