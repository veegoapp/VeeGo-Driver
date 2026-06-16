export type DemoState = {
  currentStopIndex: number;
  checkedInByStop: Record<number, Record<string, boolean>>;
};

export const DEMO_INITIAL_STATE: DemoState = {
  currentStopIndex: 0,
  checkedInByStop: {},
};

type Action =
  | { type: 'NEXT_STOP' }
  | { type: 'TOGGLE_PASSENGER'; id: string; stopIndex: number }
  | { type: 'RESET' };

export function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'NEXT_STOP':
      return { ...state, currentStopIndex: state.currentStopIndex + 1 };
    case 'TOGGLE_PASSENGER': {
      const prev = state.checkedInByStop[action.stopIndex] ?? {};
      return {
        ...state,
        checkedInByStop: {
          ...state.checkedInByStop,
          [action.stopIndex]: { ...prev, [action.id]: !prev[action.id] },
        },
      };
    }
    case 'RESET':
      return DEMO_INITIAL_STATE;
    default:
      return state;
  }
}
