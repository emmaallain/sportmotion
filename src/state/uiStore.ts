import { create } from 'zustand';

import type { Rotation } from '@/game/city';

export type ToastTone = 'info' | 'success' | 'warning';
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface Celebration {
  id: number;
  kind: 'level' | 'era' | 'full_day' | 'chest';
  title: string;
  body: string;
  /** Optional emoji lines (e.g. chest loot). */
  lines?: string[];
}

export type Placement =
  | { mode: 'new'; itemId: string; rot: Rotation; x: number | null; y: number | null }
  | { mode: 'move'; id: string; itemId: string; rot: Rotation; x: number; y: number };

export interface UiState {
  toasts: Toast[];
  celebrations: Celebration[];
  /** Amounts of Pulses currently "flying" to the counter. */
  flights: { id: number; amount: number }[];
  placement: Placement | null;
  selectedId: string | null;
  /** Tutorial step shown on the city screen during onboarding. */
  tutorial: 'place_house' | null;
  pushToast: (text: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  celebrate: (c: Omit<Celebration, 'id'>) => void;
  dismissCelebration: () => void;
  flyPulses: (amount: number) => void;
  landFlight: (id: number) => void;
  setPlacement: (p: Placement | null) => void;
  select: (id: string | null) => void;
  setTutorial: (t: UiState['tutorial']) => void;
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  celebrations: [],
  flights: [],
  placement: null,
  selectedId: null,
  tutorial: null,
  pushToast: (text, tone = 'info') =>
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id: nextId++, text, tone }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  celebrate: (c) => set((s) => ({ celebrations: [...s.celebrations, { ...c, id: nextId++ }] })),
  dismissCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
  flyPulses: (amount) =>
    set((s) => ({ flights: [...s.flights.slice(-3), { id: nextId++, amount }] })),
  landFlight: (id) => set((s) => ({ flights: s.flights.filter((f) => f.id !== id) })),
  setPlacement: (placement) => set({ placement, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  setTutorial: (tutorial) => set({ tutorial }),
}));
