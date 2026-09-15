import { rtlIconStyle } from './rtlUtils';

describe('rtlIconStyle', () => {
  it('does not flip icons for LTR (English)', () => {
    expect(rtlIconStyle(false)).toEqual({ transform: [{ scaleX: 1 }] });
  });

  it('mirrors icons horizontally for RTL (Arabic)', () => {
    expect(rtlIconStyle(true)).toEqual({ transform: [{ scaleX: -1 }] });
  });
});
