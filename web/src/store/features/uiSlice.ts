import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  loading: {
    isOpen: boolean;
    message?: string;
  };
}

const initialState: UiState = {
  loading: {
    isOpen: false,
    message: undefined,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showLoading: (state, action: PayloadAction<string | undefined>) => {
      state.loading.isOpen = true;
      state.loading.message = action.payload;
    },
    hideLoading: (state) => {
      state.loading.isOpen = false;
      state.loading.message = undefined;
    },
  },
});

export const { showLoading, hideLoading } = uiSlice.actions;
export default uiSlice.reducer;
