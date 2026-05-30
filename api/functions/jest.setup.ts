// Runs before any test module is imported (jest `setupFiles`).
// Pin the environment to `test` so env.config loads secrets/.env.test (emulator/test
// config) instead of the default `staging` — otherwise tests would load real staging
// secrets and attempt to connect to staging Redis.
process.env.APP_ENV = "test";
