import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should format HttpException correctly according to spec', () => {
    const mockJson = vi.fn();
    const mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: mockStatus,
        }),
        getRequest: () => ({
          url: '/channels/123/messages',
        }),
      }),
    };

    const exception = new ForbiddenException(
      'You are not a member of this channel',
    );
    filter.catch(exception, mockHost as any);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 403,
        message: 'You are not a member of this channel',
        error: 'Forbidden',
        path: '/channels/123/messages',
        timestamp: expect.any(String),
      }),
    );
  });
});
