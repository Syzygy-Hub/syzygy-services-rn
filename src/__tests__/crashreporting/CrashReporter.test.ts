import { ConsoleCrashReporter } from '../../crashreporting/CrashReporter';

describe('CrashReporter', () => {
  it('ConsoleCrashReporter records error without throwing', () => {
    const reporter = new ConsoleCrashReporter();
    expect(() => reporter.recordError(new Error('test'), { ctx: 'test' })).not.toThrow();
    expect(() => reporter.reportCrash('test crash')).not.toThrow();
  });
});
