// Local store for sign-up document URLs collected across register-documents screen.
// Service type, vehicle, and plate are now saved to the backend immediately at each step.
// Documents are batched and submitted together in register-complete.

export type SignupDocument = {
  type: string;
  fileUrl: string;
  mimeType: string;
};

type SignupState = {
  documents: SignupDocument[];
};

const _state: SignupState = {
  documents: [],
};

export const signupStore = {
  addDocument(doc: SignupDocument) {
    const idx = _state.documents.findIndex(d => d.type === doc.type);
    if (idx >= 0) _state.documents[idx] = doc;
    else _state.documents.push(doc);
  },
  getAll(): SignupState { return { documents: [..._state.documents] }; },
  reset() {
    _state.documents = [];
  },
};
