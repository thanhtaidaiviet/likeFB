import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleClientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || ''

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Vite only exposes VITE_* by default. Inject GOOGLE_CLIENT_ID for frontend usage.
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
    },
    server: {
      proxy: {
        // Express API (likefb-smm-api)
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
        // Panel API (vercel functions under likefb-smm-dashboard/api/smm/*)
        // Usage: call /smm/* from frontend; proxy rewrites to /api/smm/* on the Vercel dev server.
        '/smm': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/smm/, '/api/smm'),
        },
      },
    },
  }
})
