import { pino, type Logger } from 'pino';

export function createLogger(level: string, service = 'api'): Logger {
  return pino({
    level,
    base: { service },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  });
}
