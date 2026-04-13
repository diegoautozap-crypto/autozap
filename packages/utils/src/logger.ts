import winston from 'winston'

export function createLogger(serviceName?: string) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: serviceName ? { service: serviceName } : undefined,
    format: winston.format.combine(
      winston.format.timestamp(),
      process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
              return `${timestamp} [${level}] ${message}${metaStr}`
            }),
          ),
    ),
    transports: [new winston.transports.Console()],
  })
}

export const logger = createLogger()
