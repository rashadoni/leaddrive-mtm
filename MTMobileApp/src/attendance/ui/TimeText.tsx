import React, { forwardRef, useContext } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { TimeFontScale, useTimePresentation } from './TimePresentation';

/**
 * RN 0.84 paragraphs retain measured Content across a font-only configuration
 * change. Replace that native paragraph, not the screen or its draft state.
 * Native font scaling, selection, accessibility props and refs stay intact.
 */
export const TimeText = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(
  function TimeText(props, ref) {
    const time = useTimePresentation();
    const fontScale = useContext(TimeFontScale);
    return <NativeText {...props} key={time ? fontScale : undefined} ref={ref} />;
  },
);
