import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers/*', dest: 'cesium/Workers' },
        { src: 'node_modules/cesium/Build/Cesium/Assets/*', dest: 'cesium/Assets' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets/*', dest: 'cesium/Widgets' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty/*', dest: 'cesium/ThirdParty' },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  server: {
    proxy: {
      '/orbitops': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
