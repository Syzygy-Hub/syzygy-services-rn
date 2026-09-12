import { ConsoleCrashReporter, InMemoryCrashReporter } from '../../crashreporting/CrashReporter';

// ---------------------------------------------------------------------------
// InMemoryCrashReporter
// ---------------------------------------------------------------------------

describe('InMemoryCrashReporter', () => {
  it('recordError stores the error record', () => {
    const reporter = new InMemoryCrashReporter();
    const error = new Error('test error');
    reporter.recordError(error, { module: 'auth' });
    expect(reporter.errors).toHaveLength(1);
    expect(reporter.errors[0].error).toBe(error);
    expect(reporter.errors[0].metadata.module).toBe('auth');
  });

  it('reportCrash stores the crash record', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.reportCrash('fatal crash', { screen: 'Home' });
    expect(reporter.crashes).toHaveLength(1);
    expect(reporter.crashes[0].message).toBe('fatal crash');
    expect(reporter.crashes[0].metadata.screen).toBe('Home');
  });

  it('setUserContext is retrievable', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.setUserContext({ userId: 'u1', email: 'u@example.com' });
    expect(reporter.userContext?.userId).toBe('u1');
    expect(reporter.userContext?.email).toBe('u@example.com');
  });

  it('setUserContext can be cleared with undefined', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.setUserContext({ userId: 'u1' });
    reporter.setUserContext(undefined);
    expect(reporter.userContext).toBeUndefined();
  });

  it('setMetadata stores key-value pairs', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.setMetadata('version', '1.2.3');
    reporter.setMetadata('env', 'prod');
    expect(reporter.metadata.version).toBe('1.2.3');
    expect(reporter.metadata.env).toBe('prod');
  });

  it('metadata is included in crash records', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.setMetadata('buildNumber', '42');
    reporter.reportCrash('boom');
    expect(reporter.crashes[0].metadata.buildNumber).toBe('42');
  });

  it('metadata is included in error records', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.setMetadata('env', 'staging');
    reporter.recordError(new Error('oops'));
    expect(reporter.errors[0].metadata.env).toBe('staging');
  });
});

// ---------------------------------------------------------------------------
// ConsoleCrashReporter
// ---------------------------------------------------------------------------

describe('ConsoleCrashReporter', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('recordError does not throw', () => {
    const reporter = new ConsoleCrashReporter();
    expect(() => reporter.recordError(new Error('non-fatal'), { ctx: 'test' })).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('reportCrash does not throw', () => {
    const reporter = new ConsoleCrashReporter();
    expect(() => reporter.reportCrash('crash msg')).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('setUserContext is stored and reflected in crash reports', () => {
    const reporter = new ConsoleCrashReporter();
    reporter.setUserContext({ userId: 'u42' });
    reporter.reportCrash('uh oh');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[CrashReporter] CRASH:',
      'uh oh',
      expect.any(Object),
      expect.objectContaining({ userId: 'u42' }),
    );
  });

  it('setMetadata is reflected in error reports', () => {
    const reporter = new ConsoleCrashReporter();
    reporter.setMetadata('platform', 'ios');
    reporter.recordError(new Error('err'));
    expect(consoleSpy).toHaveBeenCalledWith(
      '[CrashReporter] ERROR:',
      'err',
      expect.objectContaining({ platform: 'ios' }),
      undefined,
    );
  });
});
