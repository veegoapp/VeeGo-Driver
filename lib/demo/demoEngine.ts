// ── Demo trip state machine ────────────────────────────────────────────────────
// Pure reducer — no side effects, no network calls, no timers.
// All state is in-memory and discarded when the driver exits demo mode.

export type DemoState = {
  currentStopIndex: number;
  // stopIndex → passengerId → checkedIn
  checkedInByStop: Record<number, Record<string, boolean>>;
};

export type DemoAction =
  | { type: 'TOGGLE_PASSENGER'; id: string; stopIndex: number }
  | { type: 'NEXT_STOP' }
  | { type: 'RESET' };

export const DEMO_INITIAL_STATE: DemoState = {
  currentStopIndex: 0,
  checkedInByStop: {},
};

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'TOGGLE_PASSENGER': {
      const stopMap = state.checkedInByStop[action.stopIndex] ?? {};
      return {
        ...state,
        checkedInByStop: {
          ...state.checkedInByStop,
          [action.stopIndex]: {
            ...stopMap,
            [action.id]: !stopMap[action.id],
          },
        },
      };
    }

    case 'NEXT_STOP': {
      return {
        ...state,
        currentStopIndex: state.currentStopIndex + 1,
      };
    }

    case 'RESET': {
      return DEMO_INITIAL_STATE;
    }

    default:
      return state;
  }
}
