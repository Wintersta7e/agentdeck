import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: ['electron-store'] },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          office: resolve(__dirname, 'src/preload/office.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      target: 'chrome134',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          office: resolve(__dirname, 'src/renderer/office.html'),
        },
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'zustand', 'react-window', '@xyflow/react'],
            'vendor-dndkit': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit'],
          },
        },
      },
    },
  },
})
