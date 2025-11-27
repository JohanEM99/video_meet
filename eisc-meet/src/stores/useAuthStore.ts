import { create } from 'zustand';

interface User {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

type AuthStore = {
  user: User | null;
  alternateUser: User | null;  // Agregamos el segundo usuario
  setUser: (user: User) => void;
  setAlternateUser: (user: User) => void;  // Función para actualizar el segundo usuario
};

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  alternateUser: null,  // Inicializamos el segundo usuario como null
  setUser: (user: User) => set({ user }),  // Función para actualizar el primer usuario
  setAlternateUser: (user: User) => set({ alternateUser: user }),  // Función para actualizar el segundo usuario
}));

export default useAuthStore;
