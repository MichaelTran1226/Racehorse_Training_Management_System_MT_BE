import { TrainingScheduler } from './training.scheduler';
import { TrainingCommonService } from './training-common.service';

describe('TrainingScheduler (C-02)', () => {
  it('should run the overdue sweep every night and survive errors', async () => {
    const training = { sweepOverdue: jest.fn().mockRejectedValueOnce(new Error('db down')) };
    const scheduler = new TrainingScheduler(training as unknown as TrainingCommonService);
    await expect(scheduler.nightlySweep()).resolves.toBeUndefined();
    await scheduler.nightlySweep();
    expect(training.sweepOverdue).toHaveBeenCalledTimes(2);
  });
});
