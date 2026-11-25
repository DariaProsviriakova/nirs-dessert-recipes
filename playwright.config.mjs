import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export default defineConfig({
  testDir:'backend/tests/browser', fullyParallel:false, workers:1, timeout:45000,
  reporter:[['list']], outputDir:'backend/.test-artifacts/browser',
  use:{baseURL:'http://127.0.0.1:8011',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{
    command:'node backend/server.mjs',url:'http://127.0.0.1:8011/api/health',reuseExistingServer:false,timeout:60000,
    env:{HOST:'127.0.0.1',PORT:'8011',APP_ORIGINS:'http://127.0.0.1:8011',
      DB_PATH:'backend/.test-artifacts/e2e-'+randomUUID()+'.sqlite',
      ADMIN_EMAIL:'admin-e2e@example.test',ADMIN_PASSWORD:'Synthetic-admin-2026',
      LLM_PROVIDER:'none',LLM_API_KEY:''},
  },
});
