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
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false
      }
    }
  },
  /*
   * 预览服务必须绑定到 127.0.0.1：Linux 上 localhost 可能只解析到 IPv6，
   * 浏览器测试按 IPv4 探测就会一直连不上，表现为构建成功但测试超时。
   */
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    /*
     * 显式声明要兼容的浏览器：esbuild 在默认目标下会把
     * `backdrop-filter` 与 `-webkit-backdrop-filter` 当作同一个属性的重复声明，
     * 只保留带前缀的那一条，结果 Chrome 读到的计算值是 none，玻璃模糊在网页上消失。
     * 指定目标后会同时保留标准属性与前缀，Safari 16/17 与 Chrome 都能拿到模糊。
     */
    cssTarget: ['chrome90', 'safari15']
  }
});
