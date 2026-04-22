import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MeditationElement {
  id: number;
  text?: string;
  voice_id?: string;
  speed?: string;
  pause_duration?: string;
  sound_file?: string;
}

export interface Meditation {
  id: number;
  title: string;
  description?: string;
  meditationArray: MeditationElement[];
  filename: string;
  filePath?: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  listenCount: number;
  isFavorite?: boolean;
  isOwned?: boolean;
  ownerUserId?: number;
}

export interface MeditationState {
  meditations: Meditation[];
  loading: boolean;
  error: string | null;
}

const initialState: MeditationState = {
  meditations: [],
  loading: false,
  error: null,
};

export const meditationSlice = createSlice({
  name: "meditation",
  initialState,
  reducers: {
    setMeditations: (state, action: PayloadAction<Meditation[]>) => {
      state.meditations = action.payload;
      state.loading = false;
      state.error = null;
    },
    addMeditation: (state, action: PayloadAction<Meditation>) => {
      state.meditations.unshift(action.payload);
    },
    deleteMeditation: (state, action: PayloadAction<number>) => {
      state.meditations = state.meditations.filter(
        (meditation) => meditation.id !== action.payload,
      );
    },
    updateMeditation: (
      state,
      action: PayloadAction<Partial<Meditation> & { id: number }>,
    ) => {
      const meditation = state.meditations.find(
        (m) => m.id === action.payload.id,
      );
      if (meditation) {
        Object.assign(meditation, action.payload);
      }
    },
    toggleFavorite: (
      state,
      action: PayloadAction<{ id: number; isFavorite: boolean }>,
    ) => {
      const meditation = state.meditations.find(
        (m) => m.id === action.payload.id,
      );
      if (meditation) {
        meditation.isFavorite = action.payload.isFavorite;
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

export const {
  setMeditations,
  addMeditation,
  updateMeditation,
  deleteMeditation,
  toggleFavorite,
  setLoading,
  setError,
} = meditationSlice.actions;

export default meditationSlice.reducer;
