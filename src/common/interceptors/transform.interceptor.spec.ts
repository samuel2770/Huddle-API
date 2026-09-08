import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('should wrap data in { success: true, data } envelope', async () => {
    const context = {} as any;
    const next = {
      handle: () => of({ messageId: '123', content: 'test' }),
    };

    const observable = interceptor.intercept(context, next);
    observable.subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: { messageId: '123', content: 'test' },
      });
    });
  });

  it('should pass through already-formatted ApiResponse', async () => {
    const context = {} as any;
    const existing = { success: true, data: { foo: 'bar' } };
    const next = {
      handle: () => of(existing),
    };

    const observable = interceptor.intercept(context, next);
    observable.subscribe((result) => {
      expect(result).toBe(existing);
    });
  });
});
