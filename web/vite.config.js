import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 网页挂载在 https://accumulation93.com/web 下，构建产物使用同一前缀，
 * 这样页面与接口同源，不需要改动服务端的跨域配置。
 * 本地开发把 /api 转发到本机 Express，保持与生产一致的调用方式。
 */
export default defineConfig({
  base: '/web/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200
  }
});
