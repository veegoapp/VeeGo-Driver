import { onServiceTypeFromBackend, emitServiceTypeFromBackend } from './serviceTypeBridge';

describe('serviceTypeBridge', () => {
  it('notifies a subscribed listener when a service type is emitted', () => {
    const listener = jest.fn();
    onServiceTypeFromBackend(listener);

    emitServiceTypeFromBackend('SHUTTLE');

    expect(listener).toHaveBeenCalledWith('SHUTTLE');
  });

  it('notifies every subscribed listener', () => {
    const a = jest.fn();
    const b = jest.fn();
    onServiceTypeFromBackend(a);
    onServiceTypeFromBackend(b);

    emitServiceTypeFromBackend('CAR');

    expect(a).toHaveBeenCalledWith('CAR');
    expect(b).toHaveBeenCalledWith('CAR');
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const listener = jest.fn();
    const unsubscribe = onServiceTypeFromBackend(listener);

    unsubscribe();
    emitServiceTypeFromBackend('SCOOTER');

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no subscribers', () => {
    expect(() => emitServiceTypeFromBackend('DELIVERY')).not.toThrow();
  });

  it('unsubscribing one listener does not affect another still-subscribed listener', () => {
    const a = jest.fn();
    const b = jest.fn();
    const unsubscribeA = onServiceTypeFromBackend(a);
    onServiceTypeFromBackend(b);

    unsubscribeA();
    emitServiceTypeFromBackend('CAR');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('CAR');
  });
});
