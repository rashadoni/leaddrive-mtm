import React, { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/** Ordinary MTM keeps its existing native text lifecycle. */
export const TimePresentation = createContext(false);
export const useTimePresentation = () => useContext(TimePresentation);
export const TimeFontScale = createContext(1);

/** One font subscription, including sheets outside the navigator. */
export function TimePresentationProvider({ children }: { children: React.ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return <TimePresentation.Provider value>
    <TimeFontScale.Provider value={fontScale}>{children}</TimeFontScale.Provider>
  </TimePresentation.Provider>;
}
