// Local store for sign-up data collected across registration screens.
// Nothing here is sent to the backend until register-complete is called.
// If the driver abandons sign-up mid-way, this data is simply discarded —
// no partial driver profile is left in the backend.

export type SignupVehicle = {
  brandId: number;
  brandName: string;
  modelId: number;
  modelName: string;
  year: number;
  color: string;
  colorId: number;
};

export type SignupDocument = {
  type: string;
  fileUrl: string;
  mimeType: string;
};

type SignupState = {
  serviceType: string | null;
  vehicle: SignupVehicle | null;
  plateLetters: string | null;
  plateNumbers: string | null;
  documents: SignupDocument[];
};

const _state: SignupState = {
  serviceType: null,
  vehicle: null,
  plateLetters: null,
  plateNumbers: null,
  documents: [],
};

export const signupStore = {
  setServiceType(t: string) { _state.serviceType = t; },
  setVehicle(v: SignupVehicle) { _state.vehicle = v; },
  setPlate(letters: string, numbers: string) {
    _state.plateLetters = letters;
    _state.plateNumbers = numbers;
  },
  addDocument(doc: SignupDocument) {
    const idx = _state.documents.findIndex(d => d.type === doc.type);
    if (idx >= 0) _state.documents[idx] = doc;
    else _state.documents.push(doc);
  },
  getAll(): SignupState { return { ..._state, documents: [..._state.documents] }; },
  reset() {
    _state.serviceType = null;
    _state.vehicle = null;
    _state.plateLetters = null;
    _state.plateNumbers = null;
    _state.documents = [];
  },
};
