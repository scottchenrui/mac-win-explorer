import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

export const API_PORT = 5174;
export const DEV_PORT = 5173;

/**
 * 仅在 build 阶段注入 CSP：开发期注入会拦截 Vite 的 HMR websocket。
 */
function injectCspInBuildOnly(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file:",
    "connect-src 'self' ws: wss: http://127.0.0.1:*",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
  return {
    name: 'inject-csp-in-build-only',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), injectCspInBuildOnly()],
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@renderer': '/src/renderer',
    },
  },
  // 生产环境通过 file:// 加载，必须用相对路径
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    // Electron 43 内置 Chromium 150；用 130 作为下限是安全的语法降级
    target: 'chrome130',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
