import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      unstubEnvs: true,
      // Tests start with no server address, whatever the developer's own .env.local says; a test that needs one stubs it.
      env: { VITE_CERT_API_URL: '' },
    },
  }),
)
