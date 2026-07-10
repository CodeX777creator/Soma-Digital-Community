import 'server-only';

import { socialModule } from './social';

export function createSchedulingModule() {
  return {
    socialCalendar: socialModule.calendar,
  };
}

export const schedulingModule = createSchedulingModule();

