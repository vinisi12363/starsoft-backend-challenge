import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler, Logger } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as os from 'os';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly workerId = os.hostname();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          this.logger.log(
            `[Worker: ${this.workerId}] ${method} ${url} ${statusCode} - ${Date.now() - now}ms`,
          );
          response.header('X-Worker-ID', this.workerId);
        },
        error: (error) => {
          const response = context.switchToHttp().getResponse();
          const statusCode = error.status || 500;
          this.logger.error(
            `[Worker: ${this.workerId}] ${method} ${url} ${statusCode} - ${Date.now() - now}ms`,
          );
          response.header('X-Worker-ID', this.workerId);
        },
      }),
    );
  }
}
