import { createContext, useContext } from 'react';

// A retained reader remains subscribed to authorization, but a hidden reader
// must never own keyboard gestures, read receipts or follow-mode scrolling.
export const ProductViewVisibility = createContext(true);
export const useProductViewVisible = () => useContext(ProductViewVisibility);
