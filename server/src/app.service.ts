import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  alive(): { status: string } {
    return { status: 'ok' };
  }
}
