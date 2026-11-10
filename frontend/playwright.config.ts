import { PLATFORM_EMAIL, PLATFORM_PASSWORD } from './e2e/accounts'
import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run the real Django API (fresh SQLite file) and the Vite dev server.
 * Activate the backend venv first, or set E2E_PYTHON (e.g. "uv run python").
 */
const python = process.env.E2E_PYTHON ?? 'python'
const backendEnv = {
  DJANGO_SETTINGS_MODULE: 'config.settings.local',
  DJANGO_SECRET_KEY: 'e2e-only-secret-key-not-used-anywhere-else-0123456789',
  DJANGO_DEBUG: 'true',
  DB_ENGINE: 'sqlite',
  SQLITE_PATH: 'e2e.sqlite3',
  THROTTLE_AUTH_RATE: '1000/min',
  THROTTLE_ENQUIRY_RATE: '1000/min',
  THROTTLE_PUBLIC_FORM_RATE: '1000/min',
  // New listings normally wait for the platform team; the journey publishes its own.
  LISTINGS_REQUIRE_VERIFICATION: 'false',
  MEDIA_ROOT: 'e2e-media',
  // The test SMS gateway prints codes; with DEBUG on every code is this value.
  SMS_TEST_CODE: '123456',
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `rm -rf e2e.sqlite3 e2e-media && ${python} manage.py migrate --noinput -v0 && ${python} manage.py create_platform_admin --email ${PLATFORM_EMAIL} --password ${PLATFORM_PASSWORD} && ${python} manage.py runserver 127.0.0.1:8000 --noreload`,
      cwd: '../backend',
      env: backendEnv,
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
