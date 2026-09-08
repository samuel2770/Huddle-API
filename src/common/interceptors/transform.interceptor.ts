import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface.js';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data is already an ApiResponse shape, return as is
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          data.success === true &&
          'data' in data
        ) {
          return data;
        }

        return {
          success: true,
          data: data ?? null,
        };
      }),
    );
  }
}
